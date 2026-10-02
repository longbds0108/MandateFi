// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockYieldOracle
/// @notice Owner-updated APY feed in bps per pool.
/// @dev RIALO: on Rialo this will be replaced by a native webcall oracle; keep the ABI stable.
contract MockYieldOracle is Ownable {
    mapping(address pool => uint256 bps) private _apy;

    event ApySet(address indexed pool, uint256 bps);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setApy(address pool, uint256 bps) external onlyOwner {
        _apy[pool] = bps;
        emit ApySet(pool, bps);
    }

    function apyBps(address pool) external view returns (uint256) {
        return _apy[pool];
    }
}
