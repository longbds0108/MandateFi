// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IMandateVault} from "./interfaces/IMandateVault.sol";
import {
    OnlyExecutorCanDrain,
    InsufficientVaultBalance,
    TokenTransferMismatch,
    ZeroAmount,
    ZeroAddress
} from "./errors/Errors.sol";

/// @title MandateVault
/// @notice Holds users' USDC. Only the owner can withdraw their own balance; only the
///         PolicyExecutor can move it to third-party destinations under a mandate.
/// @dev Pause blocks new deposits but never blocks the user's own `withdraw`.
contract MandateVault is IMandateVault, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable _usdc;

    /// @notice The PolicyExecutor contract. Set by owner during deployment wiring.
    address public policyExecutor;

    /// @notice Per-user vaulted balance in USDC (6 decimals).
    mapping(address owner => uint256 balance) public balances;

    /// @notice Sum of all `balances`. Used as an invariant check against USDC holdings.
    uint256 public totalDeposits;

    event PolicyExecutorSet(address indexed policyExecutor);

    constructor(address initialOwner, address usdc_) Ownable(initialOwner) {
        if (usdc_ == address(0)) revert ZeroAddress("usdc");
        _usdc = IERC20(usdc_);
    }

    // ─────────────── Wiring ───────────────

    function setPolicyExecutor(address executor) external onlyOwner {
        if (executor == address(0)) revert ZeroAddress("policyExecutor");
        policyExecutor = executor;
        emit PolicyExecutorSet(executor);
    }

    // ─────────────── User API ───────────────

    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 before_ = _usdc.balanceOf(address(this));
        _usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = _usdc.balanceOf(address(this)) - before_;
        if (received != amount) revert TokenTransferMismatch(amount, received);

        balances[msg.sender] += amount;
        totalDeposits += amount;
        emit Deposit(msg.sender, amount, balances[msg.sender]);
    }

    /// @notice Users can always pull their own balance back, even while paused or if their mandates are revoked.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = balances[msg.sender];
        if (bal < amount) revert InsufficientVaultBalance(msg.sender, amount, bal);
        balances[msg.sender] = bal - amount;
        totalDeposits -= amount;
        _usdc.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount, balances[msg.sender]);
    }

    // ─────────────── Executor hook ───────────────

    function executeTransfer(uint256 mandateId, address owner_, address destination, uint256 amount)
        external
        nonReentrant
    {
        if (msg.sender != policyExecutor) revert OnlyExecutorCanDrain(msg.sender);
        if (amount == 0) revert ZeroAmount();
        if (destination == address(0)) revert ZeroAddress("destination");

        uint256 bal = balances[owner_];
        if (bal < amount) revert InsufficientVaultBalance(owner_, amount, bal);
        balances[owner_] = bal - amount;
        totalDeposits -= amount;

        _usdc.safeTransfer(destination, amount);
        emit ExecutedTransfer(mandateId, owner_, destination, amount);
    }

    // ─────────────── Pausable (owner only) ───────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─────────────── Views ───────────────

    function balanceOf(address owner_) external view returns (uint256) {
        return balances[owner_];
    }

    function usdc() external view returns (address) {
        return address(_usdc);
    }
}
