// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {MandateVault} from "../src/MandateVault.sol";
import {PolicyExecutor} from "../src/PolicyExecutor.sol";
import {IMandateRegistry} from "../src/interfaces/IMandateRegistry.sol";
import {IPolicyExecutor} from "../src/interfaces/IPolicyExecutor.sol";
import {
    MandateNotActive,
    MandateExpired,
    CallerNotAgent,
    DestinationNotApproved,
    ExceedsPerTxLimit,
    ExceedsDailyLimit,
    NotMandateOwner,
    ProposalNotPending
} from "../src/errors/Errors.sol";

contract PolicyExecutorTest is Test {
    MockUSDC usdc;
    MandateRegistry registry;
    MandateVault vault;
    PolicyExecutor exec;

    address owner = address(0xA1);
    address agent = address(0xA2);
    address stranger = address(0xA3);
    address aave = address(0xB1);
    address compound = address(0xB2);
    address unknownPool = address(0xB9);

    uint256 constant PER_TX = 200e6;
    uint256 constant DAILY = 500e6;
    uint256 constant THRESHOLD = 100e6;
    uint64 constant EXPIRY_FUTURE = 1_900_000_000; // far enough

    function setUp() public {
        usdc = new MockUSDC();
        registry = new MandateRegistry(address(this));
        vault = new MandateVault(address(this), address(usdc));
        exec = new PolicyExecutor(address(this), address(registry), address(vault));

        registry.setPolicyExecutor(address(exec));
        vault.setPolicyExecutor(address(exec));

        // Fund owner, deposit into vault
        usdc.mint(owner, 10_000e6);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(10_000e6);
        vm.stopPrank();
    }

    function _createMandate(IMandateRegistry.ExecutionMode mode) internal returns (uint256 id) {
        address[] memory dests = new address[](2);
        dests[0] = aave;
        dests[1] = compound;

        IMandateRegistry.MandateParams memory p = IMandateRegistry.MandateParams({
            agent: agent,
            approvedDestinations: dests,
            perTxLimit: PER_TX,
            dailyLimit: DAILY,
            approvalThreshold: THRESHOLD,
            apyTriggerBps: 500,
            reserveDestination: owner,
            executionMode: mode,
            expiry: EXPIRY_FUTURE
        });

        vm.prank(owner);
        id = registry.createMandate(p);
    }

    // ───────────────────── Rule 1: must be Active ─────────────────────

    function test_Rule1_PausedMandateDenied() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);
        vm.prank(owner);
        registry.pause(id);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(MandateNotActive.selector, id, IMandateRegistry.Status.Paused)
        );
        exec.propose(id, aave, 100e6, bytes32(0));
    }

    function test_Rule1_RevokedMandateDenied() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);
        vm.prank(owner);
        registry.revoke(id);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(MandateNotActive.selector, id, IMandateRegistry.Status.Revoked)
        );
        exec.propose(id, aave, 100e6, bytes32(0));
    }

    // ───────────────────── Rule 2: expiry ─────────────────────

    function test_Rule2_ExpiredMandateDenied() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);
        vm.warp(uint256(EXPIRY_FUTURE) + 1);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(MandateExpired.selector, id, EXPIRY_FUTURE, uint256(EXPIRY_FUTURE) + 1)
        );
        exec.propose(id, aave, 100e6, bytes32(0));
    }

    // ───────────────────── Rule 3: caller is the agent ─────────────────────

    function test_Rule3_NonAgentReverts() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(CallerNotAgent.selector, id, stranger, agent));
        exec.propose(id, aave, 100e6, bytes32(0));
    }

    // ───────────────────── Rule 4: destination allowlist ─────────────────────

    function test_Rule4_UnknownDestinationDenied() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(DestinationNotApproved.selector, id, unknownPool));
        exec.propose(id, unknownPool, 100e6, bytes32(0));
    }

    // ───────────────────── Rule 5: per-tx cap ─────────────────────

    function test_Rule5_OverPerTxReverts() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(ExceedsPerTxLimit.selector, PER_TX + 1, PER_TX));
        exec.propose(id, aave, PER_TX + 1, bytes32(0));
    }

    // ───────────────────── Rule 6: daily cap ─────────────────────

    function test_Rule6_OverDailyReverts() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);

        // Burn full daily cap with 10 × 50e6 (all under threshold → auto-execute)
        vm.startPrank(agent);
        for (uint256 i = 0; i < 10; i++) {
            exec.propose(id, aave, 50e6, bytes32(0));
        }
        // Now 500 used, 0 remaining.
        vm.expectRevert(abi.encodeWithSelector(ExceedsDailyLimit.selector, 50e6, 0));
        exec.propose(id, aave, 50e6, bytes32(0));
        vm.stopPrank();
    }

    function test_Rule6_DailyResetsAfterOneDay() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);

        vm.startPrank(agent);
        for (uint256 i = 0; i < 10; i++) {
            exec.propose(id, aave, 50e6, bytes32(0));
        }
        // 500 used
        vm.stopPrank();

        // Jump to next day
        vm.warp(block.timestamp + 1 days);

        vm.prank(agent);
        exec.propose(id, aave, 50e6, bytes32(0));

        IMandateRegistry.MandateView memory m = registry.getMandate(id);
        assertEq(m.usedToday, 50e6, "daily did not reset");
    }

    // ───────────────────── Rule 7: approval threshold / mode ─────────────────────

    function test_Rule7_OverThresholdRoutesToApproval() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);

        // Amount strictly over threshold but ≤ perTx → RequiresApproval
        vm.prank(agent);
        (uint256 pid, IPolicyExecutor.Verdict v) = exec.propose(id, aave, 150e6, bytes32(0));
        assertEq(uint256(v), uint256(IPolicyExecutor.Verdict.RequiresApproval));

        IPolicyExecutor.Proposal memory p = exec.getProposal(pid);
        assertEq(uint256(p.state), uint256(IPolicyExecutor.ProposalState.Pending));
    }

    function test_Rule7_RequireApprovalModeAlwaysNeedsSign() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.RequireApproval);

        vm.prank(agent);
        (, IPolicyExecutor.Verdict v) = exec.propose(id, aave, 10e6, bytes32(0));
        assertEq(uint256(v), uint256(IPolicyExecutor.Verdict.RequiresApproval));
    }

    // ───────────────────── Rule 8: happy path ─────────────────────

    function test_Rule8_AllowedExecutesImmediately() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);

        uint256 ownerBalBefore = vault.balanceOf(owner);
        uint256 destBalBefore = usdc.balanceOf(aave);

        // 50e6 is under threshold → Allowed path
        vm.prank(agent);
        (uint256 pid, IPolicyExecutor.Verdict v) = exec.propose(id, aave, 50e6, bytes32(0));

        assertEq(uint256(v), uint256(IPolicyExecutor.Verdict.Allowed));
        assertEq(vault.balanceOf(owner), ownerBalBefore - 50e6, "vault not drained");
        assertEq(usdc.balanceOf(aave), destBalBefore + 50e6, "destination not funded");

        IPolicyExecutor.Proposal memory p = exec.getProposal(pid);
        assertEq(uint256(p.state), uint256(IPolicyExecutor.ProposalState.Executed));
    }

    // ───────────────────── Approval flow ─────────────────────

    function test_OwnerCanApprovePendingProposal() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);
        vm.prank(agent);
        (uint256 pid,) = exec.propose(id, aave, 150e6, bytes32(0)); // > THRESHOLD, ≤ perTx → Pending

        uint256 destBalBefore = usdc.balanceOf(aave);
        vm.prank(owner);
        exec.approveProposal(pid);

        IPolicyExecutor.Proposal memory p = exec.getProposal(pid);
        assertEq(uint256(p.state), uint256(IPolicyExecutor.ProposalState.Executed));
        assertEq(usdc.balanceOf(aave), destBalBefore + 150e6);
    }

    function test_NonOwnerCannotApprove() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);
        vm.prank(agent);
        (uint256 pid,) = exec.propose(id, aave, 150e6, bytes32(0));

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(NotMandateOwner.selector, id, stranger, owner));
        exec.approveProposal(pid);
    }

    function test_OwnerCanReject() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);
        vm.prank(agent);
        (uint256 pid,) = exec.propose(id, aave, 150e6, bytes32(0));

        vm.prank(owner);
        exec.rejectProposal(pid);
        IPolicyExecutor.Proposal memory p = exec.getProposal(pid);
        assertEq(uint256(p.state), uint256(IPolicyExecutor.ProposalState.Rejected));
    }

    function test_CannotApproveAlreadySettled() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);
        vm.prank(agent);
        (uint256 pid,) = exec.propose(id, aave, 50e6, bytes32(0)); // auto-executes

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProposalNotPending.selector, pid, IPolicyExecutor.ProposalState.Executed
            )
        );
        exec.approveProposal(pid);
    }

    // ───────────────────── Withdrawal always open ─────────────────────

    function test_OwnerCanWithdrawEvenWhenMandatePaused() public {
        uint256 id = _createMandate(IMandateRegistry.ExecutionMode.AutoExecute);
        vm.prank(owner);
        registry.pause(id);

        uint256 before_ = usdc.balanceOf(owner);
        vm.prank(owner);
        vault.withdraw(1_000e6);
        assertEq(usdc.balanceOf(owner), before_ + 1_000e6);
    }
}
