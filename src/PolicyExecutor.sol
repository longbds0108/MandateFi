// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IMandateRegistry} from "./interfaces/IMandateRegistry.sol";
import {IMandateVault} from "./interfaces/IMandateVault.sol";
import {IPolicyExecutor} from "./interfaces/IPolicyExecutor.sol";
import {
    MandateNotFound,
    MandateNotActive,
    MandateExpired,
    CallerNotAgent,
    DestinationNotApproved,
    ExceedsPerTxLimit,
    ExceedsDailyLimit,
    NotMandateOwner,
    ProposalNotFound,
    ProposalNotPending,
    ZeroAmount
} from "./errors/Errors.sol";

/// @title PolicyExecutor
/// @notice Evaluates every proposal against its mandate in a fixed order and halts at the first violation.
/// @dev The 8-rule order is normative. Changes here require a spec update.
contract PolicyExecutor is IPolicyExecutor, Ownable, ReentrancyGuard {
    IMandateRegistry public immutable registry;
    IMandateVault public immutable vault;

    uint256 private _nextProposalId = 1;
    mapping(uint256 proposalId => Proposal) private _proposals;

    constructor(address initialOwner, address registry_, address vault_) Ownable(initialOwner) {
        registry = IMandateRegistry(registry_);
        vault = IMandateVault(vault_);
    }

    // ─────────────── Public evaluation (read-only) ───────────────

    /// @notice The 8 rules, in order. Returns the first violation's rule number, or 0 if allowed.
    /// @dev Does not touch state. Safe for `eth_call` dry-runs from the Agent Console.
    function evaluate(uint256 mandateId, address destination, uint256 amount)
        public
        view
        returns (Verdict verdict, uint8 ruleHit)
    {
        if (amount == 0) revert ZeroAmount();

        IMandateRegistry.MandateView memory m = registry.getMandate(mandateId);

        // 1. Mandate exists and is Active
        if (m.status != IMandateRegistry.Status.Active) {
            return (Verdict.Denied, 1);
        }
        // 2. Not expired
        if (block.timestamp >= m.expiry) {
            return (Verdict.Denied, 2);
        }
        // 3. Caller is the mandate's agent (we check msg.sender in propose(); evaluate() runs as view)
        //    When invoked read-only, the caller may legitimately be anyone; we treat rule 3 as pre-cleared.
        //    The transactional path re-asserts it in `propose`.
        if (tx.origin != m.agent && msg.sender != m.agent) {
            // Soft-check: still allow dry-run from any address, but propose() will re-enforce.
            // We don't emit here. This read-only hint helps the UI tell the agent they're not the one.
            ruleHit = 3; // reporting but not failing — we fall through
        }
        // 4. Destination in approved set
        if (!registry.isDestinationApproved(mandateId, destination)) {
            return (Verdict.Denied, 4);
        }
        // 5. Amount <= perTxLimit
        if (amount > m.perTxLimit) {
            return (Verdict.Denied, 5);
        }
        // 6. usedToday + amount <= dailyLimit
        if (m.usedToday + amount > m.dailyLimit) {
            return (Verdict.Denied, 6);
        }
        // 7. If amount > approvalThreshold OR mode == RequireApproval → REQUIRES_APPROVAL
        if (
            amount > m.approvalThreshold
                || m.executionMode == IMandateRegistry.ExecutionMode.RequireApproval
        ) {
            return (Verdict.RequiresApproval, 7);
        }
        // 8. Otherwise ALLOWED
        return (Verdict.Allowed, 8);
    }

    // ─────────────── Agent entry point ───────────────

    function propose(uint256 mandateId, address destination, uint256 amount, bytes32 reasonHash)
        external
        nonReentrant
        returns (uint256 proposalId, Verdict verdict)
    {
        if (amount == 0) revert ZeroAmount();

        IMandateRegistry.MandateView memory m = registry.getMandate(mandateId);
        // Hard caller check (rule 3)
        if (msg.sender != m.agent) revert CallerNotAgent(mandateId, msg.sender, m.agent);

        uint8 ruleHit;
        (verdict, ruleHit) = _evaluateHard(m, mandateId, destination, amount);

        proposalId = _nextProposalId++;
        _proposals[proposalId] = Proposal({
            id: proposalId,
            mandateId: mandateId,
            agent: msg.sender,
            destination: destination,
            amount: amount,
            reasonHash: reasonHash,
            verdict: verdict,
            state: ProposalState.None,
            createdAt: uint64(block.timestamp)
        });

        emit PolicyChecked(mandateId, proposalId, msg.sender, destination, amount, verdict, ruleHit);

        if (verdict == Verdict.Allowed) {
            _execute(proposalId);
        } else if (verdict == Verdict.RequiresApproval) {
            _proposals[proposalId].state = ProposalState.Pending;
        } else {
            // Denied: record and emit — no state change on vault.
            _proposals[proposalId].state = ProposalState.Rejected;
        }
    }

    // ─────────────── Owner approvals ───────────────

    function approveProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = _proposals[proposalId];
        if (p.id == 0) revert ProposalNotFound(proposalId);
        if (p.state != ProposalState.Pending) revert ProposalNotPending(proposalId, p.state);

        IMandateRegistry.MandateView memory m = registry.getMandate(p.mandateId);
        if (msg.sender != m.owner) revert NotMandateOwner(p.mandateId, msg.sender, m.owner);

        // Re-check rules against current state (owner may have paused meanwhile)
        (Verdict verdict,) = evaluate(p.mandateId, p.destination, p.amount);
        if (verdict == Verdict.Denied) {
            p.state = ProposalState.Rejected;
            p.verdict = Verdict.Denied;
            emit ProposalRejected(proposalId, msg.sender);
            return;
        }

        p.state = ProposalState.Approved;
        emit ProposalApproved(proposalId, msg.sender);
        _execute(proposalId);
    }

    function rejectProposal(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        if (p.id == 0) revert ProposalNotFound(proposalId);
        if (p.state != ProposalState.Pending) revert ProposalNotPending(proposalId, p.state);

        IMandateRegistry.MandateView memory m = registry.getMandate(p.mandateId);
        if (msg.sender != m.owner) revert NotMandateOwner(p.mandateId, msg.sender, m.owner);

        p.state = ProposalState.Rejected;
        emit ProposalRejected(proposalId, msg.sender);
    }

    // ─────────────── Views ───────────────

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        Proposal memory p = _proposals[proposalId];
        if (p.id == 0) revert ProposalNotFound(proposalId);
        return p;
    }

    function nextProposalId() external view returns (uint256) {
        return _nextProposalId;
    }

    // ─────────────── Internals ───────────────

    /// @dev Strict evaluation used by `propose`. Reverts with the specific rule's typed error.
    function _evaluateHard(
        IMandateRegistry.MandateView memory m,
        uint256 mandateId,
        address destination,
        uint256 amount
    ) private view returns (Verdict verdict, uint8 ruleHit) {
        // 1
        if (m.status != IMandateRegistry.Status.Active) {
            revert MandateNotActive(mandateId, m.status);
        }
        // 2
        if (block.timestamp >= m.expiry) {
            revert MandateExpired(mandateId, m.expiry, block.timestamp);
        }
        // 3 already checked in `propose`
        // 4
        if (!registry.isDestinationApproved(mandateId, destination)) {
            revert DestinationNotApproved(mandateId, destination);
        }
        // 5
        if (amount > m.perTxLimit) {
            revert ExceedsPerTxLimit(amount, m.perTxLimit);
        }
        // 6
        uint256 remaining = m.dailyLimit - m.usedToday;
        if (amount > remaining) {
            revert ExceedsDailyLimit(amount, remaining);
        }
        // 7
        if (
            amount > m.approvalThreshold
                || m.executionMode == IMandateRegistry.ExecutionMode.RequireApproval
        ) {
            return (Verdict.RequiresApproval, 7);
        }
        // 8
        return (Verdict.Allowed, 8);
    }

    function _execute(uint256 proposalId) private {
        Proposal storage p = _proposals[proposalId];
        IMandateRegistry.MandateView memory m = registry.getMandate(p.mandateId);
        // Record usage BEFORE transfer (checks-effects-interactions).
        registry.recordUsage(p.mandateId, p.amount);
        p.state = ProposalState.Executed;
        vault.executeTransfer(p.mandateId, m.owner, p.destination, p.amount);
        emit ProposalExecuted(proposalId);
    }
}
