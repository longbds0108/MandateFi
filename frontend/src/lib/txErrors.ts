import {BaseError, ContractFunctionRevertedError, type Abi} from "viem";
import {mandateVaultAbi} from "../abi/MandateVault";
import {mandateRegistryAbi} from "../abi/MandateRegistry";
import {policyExecutorAbi} from "../abi/PolicyExecutor";

const ALL_ABIS: Abi[] = [mandateVaultAbi, mandateRegistryAbi, policyExecutorAbi];

export function decodeTxError(err: unknown): string {
  if (!err) return "";
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError) as
      | ContractFunctionRevertedError
      | null;
    if (reverted) {
      const name = reverted.data?.errorName;
      const args = (reverted.data?.args ?? []) as readonly unknown[];
      switch (name) {
        case "ExceedsPerTxLimit":
          return `Amount exceeds per-tx limit (${fmtU(args[0])} > ${fmtU(args[1])} USDC)`;
        case "ExceedsDailyLimit":
          return `Daily limit reached (${fmtU(args[0])} requested, ${fmtU(args[1])} remaining)`;
        case "DestinationNotApproved":
          return `Destination not in the mandate allowlist`;
        case "CallerNotAgent":
          return `This wallet is not the mandate's agent address`;
        case "MandateNotActive":
          return `Mandate is paused or revoked`;
        case "MandateExpired":
          return `Mandate has expired`;
        case "MandateNotFound":
          return `Mandate not found`;
        case "NotMandateOwner":
          return `Only the mandate owner can do that`;
        case "InsufficientVaultBalance":
          return `Not enough balance in the vault`;
        case "InvalidMandateParams":
          return `Invalid mandate params: ${String(args[0] ?? "")}`;
        case "ZeroAmount":
          return `Amount must be greater than 0`;
        case "ZeroAddress":
          return `Address can't be zero (${String(args[0] ?? "")})`;
        default:
          return name ? `Reverted: ${name}` : reverted.shortMessage ?? err.shortMessage;
      }
    }
    return err.shortMessage ?? err.message;
  }
  return (err as Error)?.message ?? String(err);
}

function fmtU(v: unknown) {
  if (typeof v !== "bigint") return String(v);
  return (Number(v) / 1e6).toLocaleString("en-US", {maximumFractionDigits: 2});
}

export {ALL_ABIS};
