// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice 6-decimal mock USDC for local/Anvil testing only.
/// @dev Testnet demos should use Circle's real USDC at 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Open faucet for test rigs. Not for production.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
