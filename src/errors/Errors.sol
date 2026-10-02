// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IMandateRegistry} from "../interfaces/IMandateRegistry.sol";
import {IPolicyExecutor} from "../interfaces/IPolicyExecutor.sol";

/// @notice Shared custom errors. Parameters are rich enough that the UI can render a plain-English reason.

// Registry / mandate lifecycle
error MandateNotFound(uint256 mandateId);
error MandateNotActive(uint256 mandateId, IMandateRegistry.Status status);
error MandateExpired(uint256 mandateId, uint64 expiry, uint256 nowTs);
error NotMandateOwner(uint256 mandateId, address caller, address owner);
error InvalidMandateParams(string reason);
error NoDestinationsProvided();
error TooManyDestinations(uint256 provided, uint256 maxAllowed);
error ZeroAddress(string field);

// Policy evaluation
error CallerNotAgent(uint256 mandateId, address caller, address expectedAgent);
error DestinationNotApproved(uint256 mandateId, address destination);
error ExceedsPerTxLimit(uint256 amount, uint256 limit);
error ExceedsDailyLimit(uint256 proposed, uint256 remaining);
error ZeroAmount();

// Proposal lifecycle
error ProposalNotFound(uint256 proposalId);
error ProposalNotPending(uint256 proposalId, IPolicyExecutor.ProposalState state);
error ProposalAlreadySettled(uint256 proposalId);

// Vault
error OnlyExecutorCanDrain(address caller);
error InsufficientVaultBalance(address owner, uint256 requested, uint256 available);
error TokenTransferMismatch(uint256 expected, uint256 received);
