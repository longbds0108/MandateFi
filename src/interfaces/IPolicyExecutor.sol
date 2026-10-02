// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IPolicyExecutor
/// @notice Interface for the gate that evaluates every proposal against a mandate.
interface IPolicyExecutor {
    enum Verdict {
        Denied,
        Allowed,
        RequiresApproval
    }

    enum ProposalState {
        None,
        Pending,
        Approved,
        Rejected,
        Executed,
        Expired
    }

    struct Proposal {
        uint256 id;
        uint256 mandateId;
        address agent;
        address destination;
        uint256 amount;
        bytes32 reasonHash;
        Verdict verdict;
        ProposalState state;
        uint64 createdAt;
    }

    /// @notice Full audit record of a policy evaluation.
    event PolicyChecked(
        uint256 indexed mandateId,
        uint256 indexed proposalId,
        address indexed agent,
        address destination,
        uint256 amount,
        Verdict verdict,
        uint8 ruleHit
    );

    event ProposalApproved(uint256 indexed proposalId, address indexed approver);
    event ProposalRejected(uint256 indexed proposalId, address indexed rejecter);
    event ProposalExecuted(uint256 indexed proposalId);

    /// @notice Pure, read-only evaluation. Returns the verdict and the index of the rule hit (1..8).
    function evaluate(uint256 mandateId, address destination, uint256 amount)
        external
        view
        returns (Verdict verdict, uint8 ruleHit);

    /// @notice Agent submits a proposal. Evaluated, recorded, and (if ALLOWED + AutoExecute) settled in one tx.
    function propose(uint256 mandateId, address destination, uint256 amount, bytes32 reasonHash)
        external
        returns (uint256 proposalId, Verdict verdict);

    /// @notice Mandate owner signs an approval for a REQUIRES_APPROVAL proposal; executes immediately.
    function approveProposal(uint256 proposalId) external;

    /// @notice Mandate owner rejects a pending proposal.
    function rejectProposal(uint256 proposalId) external;

    function getProposal(uint256 proposalId) external view returns (Proposal memory);

    function nextProposalId() external view returns (uint256);
}
