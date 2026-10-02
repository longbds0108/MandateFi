import {useState, useMemo, useEffect} from "react";
import {useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt} from "wagmi";
import {useQueryClient} from "@tanstack/react-query";
import {erc20Abi, formatUnits, parseUnits, maxUint256} from "viem";
import {mandateVaultAbi} from "../abi/MandateVault";
import {CONTRACTS, USDC_DECIMALS, isValid} from "../config/contracts";
import {decodeTxError} from "../lib/txErrors";

type Op = "deposit" | "withdraw";

export function Vault() {
  const {address} = useAccount();
  const qc = useQueryClient();
  const [op, setOp] = useState<Op>("deposit");
  const [amount, setAmount] = useState("");

  const vaultAddr = CONTRACTS.vault;
  const canRead = isValid(vaultAddr) && !!address;

  const {data, refetch} = useReadContracts({
    contracts: canRead
      ? [
          {address: CONTRACTS.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address!]},
          {address: vaultAddr!, abi: mandateVaultAbi, functionName: "balanceOf", args: [address!]},
          {address: CONTRACTS.usdc, abi: erc20Abi, functionName: "allowance", args: [address!, vaultAddr!]},
        ]
      : [],
    query: {enabled: canRead, refetchInterval: 15_000},
  });

  const walletBal = (data?.[0]?.result as bigint) ?? 0n;
  const vaultBal = (data?.[1]?.result as bigint) ?? 0n;
  const allowance = (data?.[2]?.result as bigint) ?? 0n;

  const parsedAmount = useMemo(() => {
    try {
      return amount ? parseUnits(amount, USDC_DECIMALS) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  const needsApprove = op === "deposit" && parsedAmount > 0n && allowance < parsedAmount;
  const canSubmit =
    parsedAmount > 0n &&
    (op === "deposit" ? walletBal >= parsedAmount : vaultBal >= parsedAmount);

  // Approve tx
  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({hash: approve.data});

  // Deposit / withdraw tx
  const tx = useWriteContract();
  const txReceipt = useWaitForTransactionReceipt({hash: tx.data});

  // After approve lands, invalidate reads so allowance refreshes
  useEffect(() => {
    if (approveReceipt.isSuccess) {
      refetch();
    }
  }, [approveReceipt.isSuccess, refetch]);

  // After deposit/withdraw lands, refresh balances
  useEffect(() => {
    if (txReceipt.isSuccess) {
      refetch();
      qc.invalidateQueries();
      setAmount("");
    }
  }, [txReceipt.isSuccess, refetch, qc]);

  function onMax() {
    const max = op === "deposit" ? walletBal : vaultBal;
    setAmount(formatUnits(max, USDC_DECIMALS));
  }

  function onApprove() {
    if (!vaultAddr || parsedAmount === 0n) return;
    approve.writeContract({
      address: CONTRACTS.usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [vaultAddr, maxUint256], // Infinite approve so later deposits skip this step
    });
  }

  function onSubmit() {
    if (!vaultAddr || !canSubmit) return;
    tx.writeContract({
      address: vaultAddr,
      abi: mandateVaultAbi,
      functionName: op,
      args: [parsedAmount],
    });
  }

  // Step indicator state
  const step1Done = op === "deposit" ? !needsApprove || approveReceipt.isSuccess : false;
  const step1Active = op === "deposit" && needsApprove && !approveReceipt.isSuccess;
  const step2Active = op === "deposit" ? !needsApprove && !txReceipt.isSuccess : !txReceipt.isSuccess;
  const step3Active = txReceipt.isSuccess;

  const err = decodeTxError(approve.error) || decodeTxError(tx.error);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Vault</h1>
          <div className="sub">Deposit and withdraw test USDC on Sepolia</div>
        </div>
      </div>

      <div className="stat-grid" style={{gridTemplateColumns: "repeat(2, 1fr)", maxWidth: 720}}>
        <div className="stat">
          <div className="lbl">Wallet balance</div>
          <div className="val">
            {fmt(walletBal)}
            <span className="unit">USDC</span>
          </div>
          <div className="delta">{short(address)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Vault balance</div>
          <div className="val">
            {fmt(vaultBal)}
            <span className="unit">USDC</span>
          </div>
          <div className="delta">Allowance: {fmt(allowance)} USDC</div>
        </div>
      </div>

      <div className="grid-2">
        <div>
          <div className="form-section">
            <h3>Transfer</h3>
            <p className="section-sub">
              {op === "deposit"
                ? "Approve the ERC-20 allowance first (infinite — one-time), then deposit."
                : "Pull USDC back from the vault into your wallet."}
            </p>

            <div className="toggle" style={{marginBottom: 20}}>
              <button className={op === "deposit" ? "on" : ""} onClick={() => setOp("deposit")}>
                Deposit
              </button>
              <button className={op === "withdraw" ? "on" : ""} onClick={() => setOp("withdraw")}>
                Withdraw
              </button>
            </div>

            {op === "deposit" && (
              <div className="stepper">
                <div className={`step ${step1Done ? "done" : ""} ${step1Active ? "active" : ""}`}>
                  <span className="num">1</span>
                  <span className="lbl">Approve USDC</span>
                </div>
                <span className="arrow">→</span>
                <div className={`step ${txReceipt.isSuccess ? "done" : ""} ${step2Active && !step1Active ? "active" : ""}`}>
                  <span className="num">2</span>
                  <span className="lbl">Deposit</span>
                </div>
                <span className="arrow">→</span>
                <div className={`step ${step3Active ? "done" : ""}`}>
                  <span className="num">3</span>
                  <span className="lbl">Confirmed</span>
                </div>
              </div>
            )}

            <div className="field">
              <label>Amount</label>
              <div className="input-group">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                />
                <span className="suffix">
                  USDC ·{" "}
                  <a onClick={onMax} style={{color: "var(--color-accent)"}}>
                    Max
                  </a>
                </span>
              </div>
              <div className="hint">
                Available: {fmt(op === "deposit" ? walletBal : vaultBal)} USDC
              </div>
            </div>

            {op === "deposit" && needsApprove && !approveReceipt.isSuccess ? (
              <button
                className="btn btn-primary btn-wide"
                disabled={!canSubmit || approve.isPending || approveReceipt.isLoading}
                onClick={onApprove}
              >
                {approve.isPending || approveReceipt.isLoading
                  ? "Approving…"
                  : "Approve USDC → MandateVault"}
              </button>
            ) : (
              <button
                className="btn btn-primary btn-wide"
                disabled={!canSubmit || tx.isPending || txReceipt.isLoading}
                onClick={onSubmit}
              >
                {tx.isPending || txReceipt.isLoading
                  ? op === "deposit"
                    ? "Depositing…"
                    : "Withdrawing…"
                  : op === "deposit"
                    ? `Deposit ${amount || 0} USDC`
                    : `Withdraw ${amount || 0} USDC`}
              </button>
            )}

            {txReceipt.isSuccess && (
              <div className="chip" style={{marginTop: 12, borderColor: "rgba(79,209,197,0.4)", color: "var(--color-safe)"}}>
                ✓ Confirmed in block {txReceipt.data?.blockNumber?.toString()}
              </div>
            )}
            {err && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  background: "rgba(229, 72, 77, 0.08)",
                  border: "1px solid rgba(229, 72, 77, 0.3)",
                  borderRadius: 8,
                  color: "var(--color-danger)",
                  fontSize: "0.84rem",
                }}
              >
                {err}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="glass">
            <div className="panel-head">
              <h3>How it works</h3>
              <span className="sub">Sepolia USDC · 6 decimals</span>
            </div>
            <div style={{padding: 20, fontSize: "0.88rem", color: "var(--color-text-secondary)", lineHeight: 1.6}}>
              <p style={{marginBottom: 10}}>
                <strong style={{color: "var(--color-text-primary)"}}>Approve</strong> grants the
                MandateVault contract permission to pull the USDC from your wallet. We ask for an
                infinite allowance so future deposits skip this step.
              </p>
              <p style={{marginBottom: 10}}>
                <strong style={{color: "var(--color-text-primary)"}}>Deposit</strong> moves the
                tokens into your personal vault slot. Your balance is tracked per-address and the
                vault never co-mingles funds across users.
              </p>
              <p>
                <strong style={{color: "var(--color-text-primary)"}}>Withdraw</strong> is always
                available to you, even if a mandate is paused or revoked.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function fmt(v: bigint) {
  return Number(formatUnits(v, USDC_DECIMALS)).toLocaleString("en-US", {maximumFractionDigits: 2});
}
function short(a?: string) {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
