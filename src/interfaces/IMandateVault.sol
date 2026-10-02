// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IMandateVault
/// @notice Custodial vault that holds users' USDC and only lets the PolicyExecutor move it.
interface IMandateVault {
    event Deposit(address indexed owner, uint256 amount, uint256 newBalance);
    event Withdraw(address indexed owner, uint256 amount, uint256 newBalance);
    event ExecutedTransfer(
        uint256 indexed mandateId, address indexed owner, address indexed destination, uint256 amount
    );

    function deposit(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function balanceOf(address owner) external view returns (uint256);

    function totalDeposits() external view returns (uint256);

    /// @notice Called only by the PolicyExecutor to settle an approved proposal.
    function executeTransfer(uint256 mandateId, address owner, address destination, uint256 amount) external;

    function usdc() external view returns (address);
}
