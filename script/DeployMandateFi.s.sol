// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {MandateVault} from "../src/MandateVault.sol";
import {PolicyExecutor} from "../src/PolicyExecutor.sol";
import {MockYieldOracle} from "../src/mocks/MockYieldOracle.sol";

/// @title DeployMandateFi
/// @notice Deploys registry, vault, policy executor, mock oracle; wires them; verifies on-chain.
/// @dev Reads env: PRIVATE_KEY, USDC_ADDRESS. On Sepolia USDC defaults to Circle's
///      0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238.
contract DeployMandateFi is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envOr("USDC_ADDRESS", address(0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238));
        address deployer = vm.addr(pk);

        console2.log("Deployer:", deployer);
        console2.log("USDC:   ", usdc);

        vm.startBroadcast(pk);

        MandateRegistry registry = new MandateRegistry(deployer);
        MandateVault vault = new MandateVault(deployer, usdc);
        PolicyExecutor exec = new PolicyExecutor(deployer, address(registry), address(vault));
        MockYieldOracle oracle = new MockYieldOracle(deployer);

        // Wire
        registry.setPolicyExecutor(address(exec));
        vault.setPolicyExecutor(address(exec));

        vm.stopBroadcast();

        // Verify wiring
        require(registry.policyExecutor() == address(exec), "wiring: registry");
        require(vault.policyExecutor() == address(exec), "wiring: vault");

        console2.log("MandateRegistry:", address(registry));
        console2.log("MandateVault:  ", address(vault));
        console2.log("PolicyExecutor:", address(exec));
        console2.log("MockYieldOracle:", address(oracle));
    }
}
