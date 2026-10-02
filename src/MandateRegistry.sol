// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMandateRegistry} from "./interfaces/IMandateRegistry.sol";
import {
    MandateNotFound,
    MandateNotActive,
    NotMandateOwner,
    InvalidMandateParams,
    NoDestinationsProvided,
    TooManyDestinations,
    ZeroAddress
} from "./errors/Errors.sol";

/// @title MandateRegistry
/// @notice On-chain store of per-user mandates. Only the mandate owner mutates lifecycle.
/// @dev PolicyExecutor is the single caller allowed to increment daily usage.
contract MandateRegistry is IMandateRegistry, Ownable {
    uint256 public constant MAX_DESTINATIONS = 16;
    uint256 public constant MAX_BPS = 10_000;
    uint256 public constant DAY = 1 days;

    /// @notice The PolicyExecutor contract. Set once by the owner after deploy wiring.
    address public policyExecutor;

    uint256 private _nextId = 1;

    struct Mandate {
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
        address[] destinations;
        mapping(address => bool) isApproved;
    }

    mapping(uint256 id => Mandate) private _mandates;

    event PolicyExecutorSet(address indexed policyExecutor);

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ─────────────── Wiring ───────────────

    function setPolicyExecutor(address executor) external onlyOwner {
        if (executor == address(0)) revert ZeroAddress("policyExecutor");
        policyExecutor = executor;
        emit PolicyExecutorSet(executor);
    }

    // ─────────────── Public API ───────────────

    function createMandate(MandateParams calldata params) external returns (uint256 id) {
        _validate(params);

        id = _nextId++;
        Mandate storage m = _mandates[id];
        m.owner = msg.sender;
        m.agent = params.agent;
        m.perTxLimit = params.perTxLimit;
        m.dailyLimit = params.dailyLimit;
        m.approvalThreshold = params.approvalThreshold;
        m.apyTriggerBps = params.apyTriggerBps;
        m.reserveDestination = params.reserveDestination;
        m.executionMode = params.executionMode;
        m.expiry = params.expiry;
        m.status = Status.Active;
        m.lastDay = uint64(block.timestamp / DAY);

        for (uint256 i = 0; i < params.approvedDestinations.length; i++) {
            address dest = params.approvedDestinations[i];
            if (dest == address(0)) revert ZeroAddress("destination");
            m.destinations.push(dest);
            m.isApproved[dest] = true;
        }

        emit MandateCreated(id, msg.sender, params.agent);
    }

    function pause(uint256 id) external {
        Mandate storage m = _get(id);
        _onlyOwnerOf(id, m);
        if (m.status != Status.Active) revert MandateNotActive(id, m.status);
        m.status = Status.Paused;
        emit MandateStatusChanged(id, Status.Paused);
    }

    function resume(uint256 id) external {
        Mandate storage m = _get(id);
        _onlyOwnerOf(id, m);
        if (m.status != Status.Paused) revert MandateNotActive(id, m.status);
        m.status = Status.Active;
        emit MandateStatusChanged(id, Status.Active);
    }

    function revoke(uint256 id) external {
        Mandate storage m = _get(id);
        _onlyOwnerOf(id, m);
        if (m.status == Status.Revoked) revert MandateNotActive(id, m.status);
        m.status = Status.Revoked;
        emit MandateStatusChanged(id, Status.Revoked);
    }

    // ─────────────── Executor hook ───────────────

    function recordUsage(uint256 id, uint256 amount) external {
        if (msg.sender != policyExecutor) revert NotMandateOwner(id, msg.sender, policyExecutor);
        Mandate storage m = _get(id);
        uint64 today = uint64(block.timestamp / DAY);
        if (today != m.lastDay) {
            m.lastDay = today;
            m.usedToday = 0;
        }
        m.usedToday += amount;
        emit MandateUsageRecorded(id, amount, m.usedToday);
    }

    // ─────────────── Views ───────────────

    function isDestinationApproved(uint256 id, address destination) external view returns (bool) {
        Mandate storage m = _mandates[id];
        if (m.owner == address(0)) return false;
        return m.isApproved[destination];
    }

    function getMandate(uint256 id) external view returns (MandateView memory) {
        Mandate storage m = _get(id);
        uint64 today = uint64(block.timestamp / DAY);
        uint256 used = today == m.lastDay ? m.usedToday : 0;
        return MandateView({
            id: id,
            owner: m.owner,
            agent: m.agent,
            perTxLimit: m.perTxLimit,
            dailyLimit: m.dailyLimit,
            approvalThreshold: m.approvalThreshold,
            apyTriggerBps: m.apyTriggerBps,
            reserveDestination: m.reserveDestination,
            executionMode: m.executionMode,
            expiry: m.expiry,
            status: m.status,
            usedToday: used,
            lastDay: m.lastDay
        });
    }

    function nextMandateId() external view returns (uint256) {
        return _nextId;
    }

    function getDestinations(uint256 id) external view returns (address[] memory) {
        return _get(id).destinations;
    }

    // ─────────────── Internals ───────────────

    function _get(uint256 id) private view returns (Mandate storage m) {
        m = _mandates[id];
        if (m.owner == address(0)) revert MandateNotFound(id);
    }

    function _onlyOwnerOf(uint256 id, Mandate storage m) private view {
        if (msg.sender != m.owner) revert NotMandateOwner(id, msg.sender, m.owner);
    }

    function _validate(MandateParams calldata p) private view {
        if (p.agent == address(0)) revert ZeroAddress("agent");
        if (p.approvedDestinations.length == 0) revert NoDestinationsProvided();
        if (p.approvedDestinations.length > MAX_DESTINATIONS) {
            revert TooManyDestinations(p.approvedDestinations.length, MAX_DESTINATIONS);
        }
        if (p.perTxLimit == 0) revert InvalidMandateParams("perTxLimit=0");
        if (p.dailyLimit == 0) revert InvalidMandateParams("dailyLimit=0");
        if (p.dailyLimit < p.perTxLimit) revert InvalidMandateParams("daily<perTx");
        if (p.apyTriggerBps > MAX_BPS) revert InvalidMandateParams("apyTriggerBps>10000");
        if (p.expiry <= block.timestamp) revert InvalidMandateParams("expiry<=now");
    }
}
