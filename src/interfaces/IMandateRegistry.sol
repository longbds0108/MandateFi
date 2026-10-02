// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IMandateRegistry
/// @notice Interface for the on-chain mandate store and lifecycle controls.
interface IMandateRegistry {
    /// @notice Lifecycle status of a mandate.
    enum Status {
        None,
        Active,
        Paused,
        Revoked
    }

    /// @notice Whether `ALLOWED` proposals execute immediately or still wait for owner approval.
    enum ExecutionMode {
        AutoExecute,
        RequireApproval
    }

    /// @notice Full user-supplied parameters to create a mandate.
    struct MandateParams {
        address agent;
        address[] approvedDestinations;
        uint256 perTxLimit;
        uint256 dailyLimit;
        uint256 approvalThreshold;
        uint256 apyTriggerBps;
        address reserveDestination;
        ExecutionMode executionMode;
        uint64 expiry;
    }

    /// @notice Flattened view of a mandate for the UI and other contracts.
    struct MandateView {
        uint256 id;
        address owner;
        address agent;
        uint256 perTxLimit;
        uint256 dailyLimit;
        uint256 approvalThreshold;
        uint256 apyTriggerBps;
        address reserveDestination;
        ExecutionMode executionMode;
        uint64 expiry;
        Status status;
        uint256 usedToday;
        uint64 lastDay;
    }

    event MandateCreated(uint256 indexed id, address indexed owner, address indexed agent);
    event MandateStatusChanged(uint256 indexed id, Status newStatus);
    event MandateUsageRecorded(uint256 indexed id, uint256 amount, uint256 usedToday);

    function createMandate(MandateParams calldata params) external returns (uint256 id);

    function pause(uint256 id) external;

    function resume(uint256 id) external;

    function revoke(uint256 id) external;

    function isDestinationApproved(uint256 id, address destination) external view returns (bool);

    function getMandate(uint256 id) external view returns (MandateView memory);

    function nextMandateId() external view returns (uint256);

    /// @notice Only callable by the PolicyExecutor to increment today's usage after a successful move.
    function recordUsage(uint256 id, uint256 amount) external;
}
