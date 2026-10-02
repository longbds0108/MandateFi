import {useState, useMemo, useEffect} from "react";
import {useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract} from "wagmi";
import {useNavigate} from "react-router-dom";
import {decodeEventLog, parseUnits, isAddress, type Address} from "viem";
import {mandateRegistryAbi} from "../abi/MandateRegistry";
import {CONTRACTS, USDC_DECIMALS, isValid} from "../config/contracts";
import {decodeTxError} from "../lib/txErrors";

const MAX_DESTINATIONS = 16;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function CreateMandate() {
  const {address} = useAccount();
  const navigate = useNavigate();
  const registryAddr = CONTRACTS.registry;

  const [agent, setAgent] = useState("");
  const [destinations, setDestinations] = useState<Address[]>([]);
  const [newDest, setNewDest] = useState("");
  const [perTx, setPerTx] = useState("200");
  const [daily, setDaily] = useState("500");
  const [threshold, setThreshold] = useState("100");
  const [apyBps, setApyBps] = useState("500");
  const [reserveDest, setReserveDest] = useState("");
  const [mode, setMode] = useState<"AutoExecute" | "RequireApproval">("AutoExecute");
  const [expiry, setExpiry] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });

  useEffect(() => {
    if (address && !reserveDest) setReserveDest(address);
  }, [address, reserveDest]);

  const expiryTs = Math.floor(new Date(expiry).getTime() / 1000);
  const nowTs = Math.floor(Date.now() / 1000);
  const perTxAmount = useMemo(() => parseUsdc(perTx), [perTx]);
  const dailyAmount = useMemo(() => parseUsdc(daily), [daily]);
  const thresholdAmount = useMemo(() => parseUsdc(threshold), [threshold]);
  const apyBpsAmount = useMemo(() => parseWholeNumber(apyBps), [apyBps]);
  const limitsValid =
    perTxAmount !== undefined &&
    dailyAmount !== undefined &&
    thresholdAmount !== undefined &&
    perTxAmount > 0n &&
    dailyAmount >= perTxAmount &&
    thresholdAmount <= perTxAmount;

  const paramsValid =
    isNonZeroAddress(agent) &&
    destinations.length > 0 &&
    destinations.length <= MAX_DESTINATIONS &&
    destinations.every(isNonZeroAddress) &&
    isNonZeroAddress(reserveDest) &&
    limitsValid &&
    apyBpsAmount !== undefined &&
    apyBpsAmount <= 10_000n &&
    expiryTs > nowTs;
  const canCreate = Boolean(address) && paramsValid;

  const tx = useWriteContract();
  const receipt = useWaitForTransactionReceipt({hash: tx.data});

  const {data: nextId} = useReadContract({
    address: registryAddr,
    abi: mandateRegistryAbi,
    functionName: "nextMandateId",
    query: {enabled: isValid(registryAddr)},
  });

  function addDestination() {
    const d = newDest.trim();
    if (!isNonZeroAddress(d) || destinations.length >= MAX_DESTINATIONS) return;
    if (destinations.some((destination) => destination.toLowerCase() === d.toLowerCase())) return;
    setDestinations([...destinations, d as Address]);
    setNewDest("");
  }

  function removeDest(idx: number) {
    setDestinations(destinations.filter((_, i) => i !== idx));
  }

  function submit() {
    if (!address || !isValid(registryAddr) || !paramsValid) return;
    tx.writeContract({
      address: registryAddr,
      abi: mandateRegistryAbi,
      functionName: "createMandate",
      args: [
        {
          agent: agent as Address,
          approvedDestinations: destinations,
          perTxLimit: perTxAmount!,
          dailyLimit: dailyAmount!,
          approvalThreshold: thresholdAmount!,
          apyTriggerBps: apyBpsAmount!,
          reserveDestination: reserveDest as Address,
          executionMode: mode === "AutoExecute" ? 0 : 1,
          expiry: BigInt(expiryTs),
        },
      ],
    });
  }

  useEffect(() => {
    if (!receipt.isSuccess || !receipt.data) return;
    for (const log of receipt.data.logs) {
      try {
        const event = decodeEventLog({abi: mandateRegistryAbi, data: log.data, topics: log.topics});
        if (event.eventName === "MandateCreated" && typeof event.args.id === "bigint") {
          navigate(`/detail?id=${event.args.id.toString()}`);
          return;
        }
      } catch {
        // A receipt also includes logs from other contracts; only the registry event is relevant.
      }
    }
  }, [receipt.data, receipt.isSuccess, navigate]);

  const err = decodeTxError(tx.error);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Create mandate</h1>
          <div className="sub">
            Define the rules an agent must stay within. Signed on-chain by your Sepolia wallet.
          </div>
        </div>
        <div className="page-head-actions">
          <button
            className="btn btn-primary btn-sm"
            disabled={!canCreate || tx.isPending || receipt.isLoading}
            onClick={submit}
          >
            {tx.isPending || receipt.isLoading ? "Signing…" : "Sign mandate → Sepolia"}
          </button>
        </div>
      </div>

      <div className="grid-form">
        <div>
          <div className="form-section">
            <h3>Basics</h3>
            <div className="field">
              <label>Agent address</label>
              <input
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                placeholder="0x…"
                style={!agent || isNonZeroAddress(agent) ? {} : {borderColor: "var(--color-danger)"}}
              />
              <div className="hint">The agent can submit proposals, but never withdraw funds directly.</div>
            </div>
          </div>

          <div className="form-section">
            <h3>Approved destinations</h3>
            <div className="chip-list" style={{marginBottom: 12}}>
              {destinations.map((d, i) => {
                return (
                  <span className="chip" key={d}>
                    {short(d)}
                    <span className="x" onClick={() => removeDest(i)}>×</span>
                  </span>
                );
              })}
            </div>
            <div className="hint" style={{marginTop: 8}}>Add only destination addresses you have verified yourself.</div>
            <div style={{display: "flex", gap: 8}}>
              <input
                value={newDest}
                onChange={(e) => setNewDest(e.target.value)}
                placeholder="0x… destination address"
                style={{flex: 1}}
              />
              <button
                className="btn btn-ghost btn-sm"
                disabled={!isNonZeroAddress(newDest) || destinations.length >= MAX_DESTINATIONS}
                onClick={addDestination}
              >
                + Add
              </button>
            </div>
            {destinations.length >= MAX_DESTINATIONS && (
              <div className="hint" style={{marginTop: 8, color: "var(--color-warning)"}}>
                Maximum {MAX_DESTINATIONS} destinations per mandate.
              </div>
            )}
          </div>

          <div className="form-section">
            <h3>Limits</h3>
            <div className="field-row">
              <div className="field">
                <label>Per-tx limit</label>
                <div className="input-group">
                  <input value={perTx} onChange={(e) => setPerTx(e.target.value.replace(/[^0-9.]/g, ""))} />
                  <span className="suffix">USDC</span>
                </div>
              </div>
              <div className="field">
                <label>Daily limit</label>
                <div className="input-group">
                  <input value={daily} onChange={(e) => setDaily(e.target.value.replace(/[^0-9.]/g, ""))} />
                  <span className="suffix">USDC</span>
                </div>
              </div>
            </div>
            <div className="field">
              <label>Approval threshold</label>
              <div className="input-group">
                <input value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^0-9.]/g, ""))} />
                <span className="suffix">USDC</span>
              </div>
              <div className="hint">Above this amount, proposal routes to REQUIRES_APPROVAL.</div>
              {Number(threshold) > Number(perTx) && (
                <div className="hint" style={{color: "var(--color-warning)"}}>
                  Approval threshold must not exceed the per-tx limit.
                </div>
              )}
            </div>
          </div>

          <div className="form-section">
            <h3>APY trigger &amp; reserve</h3>
            <div className="field-row">
              <div className="field">
                <label>APY floor</label>
                <div className="input-group">
                  <input value={apyBps} onChange={(e) => setApyBps(e.target.value.replace(/[^0-9]/g, ""))} />
                  <span className="suffix">
                    bps · {(Number(apyBps) / 100).toFixed(2)}%
                  </span>
                </div>
              </div>
              <div className="field">
                <label>Reserve destination</label>
                <input
                  value={reserveDest}
                  onChange={(e) => setReserveDest(e.target.value)}
                  placeholder="0x…"
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Execution &amp; expiry</h3>
            <div className="field">
              <label>Execution mode</label>
              <div className="toggle">
                <button className={mode === "AutoExecute" ? "on" : ""} onClick={() => setMode("AutoExecute")}>
                  AutoExecute
                </button>
                <button
                  className={mode === "RequireApproval" ? "on" : ""}
                  onClick={() => setMode("RequireApproval")}
                >
                  RequireApproval
                </button>
              </div>
            </div>
            <div className="field">
              <label>Expiry</label>
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
          </div>
        </div>

        <aside className="preview">
          <div className="preview-label">Preview</div>
          <div className="preview-row"><span className="k">Next id</span><span className="v">#{String(nextId ?? "—")}</span></div>
          <div className="preview-row"><span className="k">Agent</span><span className="v" style={{fontSize: "0.76rem"}}>{short(agent) || "—"}</span></div>
          <div className="preview-row"><span className="k">Destinations</span><span className="v">{destinations.length} pools</span></div>
          <div className="preview-row"><span className="k">Per-tx</span><span className="v">{perTx || 0} USDC</span></div>
          <div className="preview-row"><span className="k">Daily</span><span className="v">{daily || 0} USDC</span></div>
          <div className="preview-row"><span className="k">Approval ≥</span><span className="v">{threshold || 0} USDC</span></div>
          <div className="preview-row"><span className="k">APY floor</span><span className="v">{(Number(apyBps) / 100).toFixed(2)}%</span></div>
          <div className="preview-row"><span className="k">Mode</span><span className="v">{mode}</span></div>
          <div className="preview-row"><span className="k">Expiry</span><span className="v">{expiry}</span></div>

          <button
            className="btn btn-primary btn-wide"
            style={{marginTop: 20}}
            disabled={!canCreate || tx.isPending || receipt.isLoading}
            onClick={submit}
          >
            {tx.isPending || receipt.isLoading ? "Signing…" : "Sign mandate → Sepolia"}
          </button>
          {!canCreate && (
            <div className="hint" style={{marginTop: 10, color: "var(--color-warning)"}}>
              {address ? "Form has invalid fields. Fix them before signing." : "Connect the owner wallet before signing."}
            </div>
          )}
          {err && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(229,72,77,0.08)",
                border: "1px solid rgba(229,72,77,0.3)",
                borderRadius: 8,
                color: "var(--color-danger)",
                fontSize: "0.82rem",
              }}
            >
              {err}
            </div>
          )}
          {receipt.isSuccess && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(79,209,197,0.08)",
                border: "1px solid rgba(79,209,197,0.3)",
                borderRadius: 8,
                color: "var(--color-safe)",
                fontSize: "0.82rem",
              }}
            >
              ✓ Mandate created in block {receipt.data?.blockNumber?.toString()}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function short(a?: string) {
  if (!a) return "";
  if (!isAddress(a)) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function isNonZeroAddress(value: string): value is Address {
  return isAddress(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

function parseUsdc(value: string): bigint | undefined {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return undefined;
  try {
    return parseUnits(value, USDC_DECIMALS);
  } catch {
    return undefined;
  }
}

function parseWholeNumber(value: string): bigint | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}
