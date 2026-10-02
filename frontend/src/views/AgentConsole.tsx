import {useState, useEffect, useMemo} from "react";
import {useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt} from "wagmi";
import {useSearchParams} from "react-router-dom";
import {parseUnits, formatUnits, keccak256, toHex, isAddress, type Address} from "viem";
import {mandateRegistryAbi} from "../abi/MandateRegistry";
import {policyExecutorAbi} from "../abi/PolicyExecutor";
import {CONTRACTS, USDC_DECIMALS, isValid} from "../config/contracts";
import {decodeTxError} from "../lib/txErrors";

type Verdict = 0 | 1 | 2;

export function AgentConsole() {
  const {address} = useAccount();
  const [searchParams] = useSearchParams();
  const requestedMandateId = searchParams.get("mandate") ?? "";
  const [mandateId, setMandateId] = useState(requestedMandateId);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("50");
  const [reason, setReason] = useState("");

  const registryAddr = CONTRACTS.registry;
  const executorAddr = CONTRACTS.executor;

  const {data: nextId} = useReadContract({
    address: registryAddr,
    abi: mandateRegistryAbi,
    functionName: "nextMandateId",
    query: {enabled: isValid(registryAddr), refetchInterval: 20_000},
  });
  const maxId = nextId ? Number(nextId) - 1 : 0;
  const mandateIds = Array.from({length: maxId}, (_, i) => i + 1);

  useEffect(() => {
    setMandateId(requestedMandateId);
  }, [requestedMandateId]);

  // Load mandate details for the selected id
  const idBig = useMemo(() => {
    try { return BigInt(mandateId); } catch { return 0n; }
  }, [mandateId]);

  const {data: mandate} = useReadContract({
    address: registryAddr,
    abi: mandateRegistryAbi,
    functionName: "getMandate",
    args: idBig > 0n ? [idBig] : undefined,
    query: {enabled: isValid(registryAddr) && idBig > 0n, refetchInterval: 10_000},
  });

  const {data: destList} = useReadContract({
    address: registryAddr,
    abi: mandateRegistryAbi,
    functionName: "getDestinations",
    args: idBig > 0n ? [idBig] : undefined,
    query: {enabled: isValid(registryAddr) && idBig > 0n},
  });
  const destinations = (destList as Address[] | undefined) ?? [];
  const m = mandate as any;
  const isAgent = Boolean(m && address && m.agent?.toLowerCase?.() === address.toLowerCase());

  useEffect(() => {
    const isAllowed = destinations.some((item) => item.toLowerCase() === destination.toLowerCase());
    if (destinations.length > 0 && !isAllowed) {
      setDestination(destinations[0]);
    }
  }, [destinations, destination]);

  const parsedAmount = useMemo(() => {
    if (!/^\d+(?:\.\d{1,6})?$/.test(amount)) return 0n;
    try { return parseUnits(amount, USDC_DECIMALS); } catch { return 0n; }
  }, [amount]);

  // Dry-run via useReadContract (eth_call to evaluate() — read-only, no gas)
  const {data: evalResult, isFetching: evalBusy, refetch: evalRefetch, error: evalError} = useReadContract({
    address: executorAddr,
    abi: policyExecutorAbi,
    functionName: "evaluate",
    account: address,
    args: idBig > 0n && isAddress(destination) && parsedAmount > 0n
      ? [idBig, destination as Address, parsedAmount]
      : undefined,
    query: {enabled: false}, // Manually triggered via button
  });

  const propose = useWriteContract();
  const proposeReceipt = useWaitForTransactionReceipt({hash: propose.data});

  function submit() {
    if (!isAgent || !isValid(executorAddr) || idBig <= 0n || !isAddress(destination) || parsedAmount === 0n) return;
    const reasonHash = reason ? keccak256(toHex(reason)) : "0x0000000000000000000000000000000000000000000000000000000000000000";
    propose.writeContract({
      address: executorAddr,
      abi: policyExecutorAbi,
      functionName: "propose",
      args: [idBig, destination as Address, parsedAmount, reasonHash],
    });
  }

  const verdict: Verdict | undefined = evalResult ? (evalResult[0] as Verdict) : undefined;
  const ruleHit: number | undefined = evalResult ? Number(evalResult[1]) : undefined;

  const err = decodeTxError(propose.error) || decodeTxError(evalError);
  const canPropose = isAgent && idBig > 0n && isAddress(destination) && parsedAmount > 0n && isValid(executorAddr);

  useEffect(() => {
    if (proposeReceipt.isSuccess) evalRefetch();
  }, [proposeReceipt.isSuccess, evalRefetch]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Agent console</h1>
          <div className="sub">
            The connected agent wallet can check and submit a proposal against the live policy.
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div>
          <div className="form-section">
            <h3>New proposal</h3>
            <p className="section-sub">
              {maxId === 0
                ? "No mandates on-chain yet. Create one first on the Create mandate page."
                : `Select mandate (1..${maxId}). Caller must be the mandate's agent to submit.`}
            </p>

            <div className="field">
              <label>Mandate id</label>
              <select value={mandateId} onChange={(e) => setMandateId(e.target.value)}>
                {mandateIds.length === 0 && <option value="">—</option>}
                {mandateIds.map((id) => (
                  <option key={id} value={id}>#{id}</option>
                ))}
              </select>
              {m && (
                <div className="hint">
                  Agent: {short(m.agent)} · perTx {fmtU(m.perTxLimit)} · daily {fmtU(m.dailyLimit)} ·
                  used today {fmtU(m.usedToday)} · {statusName(Number(m.status))}
                </div>
              )}
            </div>

            <div className="field-row">
              <div className="field">
                <label>Amount</label>
                <div className="input-group">
                  <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
                  <span className="suffix">USDC</span>
                </div>
              </div>
              <div className="field">
                <label>Destination</label>
                <select value={destination} onChange={(e) => setDestination(e.target.value)}>
                  {destinations.length === 0 && <option value="">— no destinations</option>}
                  {destinations.map((d) => (
                    <option key={d} value={d}>{short(d)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label>Reason (optional, hashed on-chain)</label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional internal reference. Only its hash is stored on-chain."
              />
            </div>

            <div style={{display: "flex", gap: 10}}>
              <button className="btn btn-ghost btn-wide" onClick={() => evalRefetch()} disabled={evalBusy || !canPropose}>
                {evalBusy ? "Checking…" : "Dry-run against policy"}
              </button>
              <button
                className="btn btn-primary btn-wide"
                onClick={submit}
                disabled={!canPropose || propose.isPending || proposeReceipt.isLoading}
              >
                {propose.isPending || proposeReceipt.isLoading ? "Submitting…" : "Submit proposal"}
              </button>
            </div>
            {!isAgent && m && (
              <div className="hint" style={{marginTop: 10, color: "var(--color-warning)"}}>
                Connect the agent wallet ({short(m.agent)}) to dry-run or submit this proposal.
              </div>
            )}
            {isAgent && parsedAmount === 0n && (
              <div className="hint" style={{marginTop: 10, color: "var(--color-warning)"}}>
                Enter a valid USDC amount with up to 6 decimal places.
              </div>
            )}
          </div>

          {verdict !== undefined && (
            <div className={`verdict-panel ${verdictClass(verdict)}`}>
              <div className="big-badge">{verdictGlyph(verdict)}</div>
              <div style={{flex: 1}}>
                <h4>{verdictHeadline(verdict)}</h4>
                <p>{verdictBody(verdict, ruleHit)}</p>
              </div>
            </div>
          )}

          {proposeReceipt.isSuccess && (
            <div className="chip" style={{marginTop: 16, borderColor: "rgba(79,209,197,0.4)", color: "var(--color-safe)"}}>
              ✓ Proposal confirmed on-chain in block {proposeReceipt.data?.blockNumber?.toString()}. Check Policy trace for its recorded result.
            </div>
          )}

          {err && (
            <div
              style={{
                marginTop: 16,
                padding: "12px 16px",
                background: "rgba(229,72,77,0.08)",
                border: "1px solid rgba(229,72,77,0.3)",
                borderRadius: 10,
                color: "var(--color-danger)",
                fontSize: "0.86rem",
              }}
            >
              {err}
            </div>
          )}
        </div>

        <div className="glass">
          <div className="panel-head">
            <h3>Mandate state</h3>
            <span className="sub">Live from registry</span>
          </div>
          <div style={{padding: 20, fontSize: "0.86rem", lineHeight: 1.65}}>
            {!m ? (
              <div style={{color: "var(--color-text-secondary)"}}>Select a mandate id to inspect.</div>
            ) : (
              <>
                <Row k="Owner" v={short(m.owner)} />
                <Row k="Agent" v={short(m.agent)} />
                <Row k="Status" v={statusName(Number(m.status))} />
                <Row k="Mode" v={Number(m.executionMode) === 0 ? "AutoExecute" : "RequireApproval"} />
                <Row k="Per-tx limit" v={`${fmtU(m.perTxLimit)} USDC`} />
                <Row k="Daily limit" v={`${fmtU(m.dailyLimit)} USDC`} />
                <Row k="Used today" v={`${fmtU(m.usedToday)} USDC`} />
                <Row k="Approval ≥" v={`${fmtU(m.approvalThreshold)} USDC`} />
                <Row k="Expiry" v={new Date(Number(m.expiry) * 1000).toISOString().slice(0, 10)} />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Row({k, v}: {k: string; v: string}) {
  return (
    <div style={{display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-border)"}}>
      <span style={{color: "var(--color-text-secondary)"}}>{k}</span>
      <span style={{fontWeight: 500}}>{v}</span>
    </div>
  );
}

function short(a?: string) {
  if (!a || !isAddress(a)) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function fmtU(v: bigint | undefined) {
  if (v === undefined) return "—";
  return Number(formatUnits(v, USDC_DECIMALS)).toLocaleString("en-US", {maximumFractionDigits: 2});
}
function statusName(s: number) {
  return ["None", "Active", "Paused", "Revoked"][s] ?? String(s);
}
function verdictClass(v: Verdict) { return v === 1 ? "allowed" : v === 2 ? "approval" : "denied"; }
function verdictGlyph(v: Verdict) { return v === 1 ? "●" : v === 2 ? "○" : "✕"; }
function verdictHeadline(v: Verdict) {
  if (v === 1) return "ALLOWED · will execute immediately";
  if (v === 2) return "REQUIRES_APPROVAL · owner signature needed";
  return "DENIED · policy blocked this proposal";
}
function verdictBody(v: Verdict, rule?: number) {
  const base = `Rule hit: ${rule ?? "?"} of 8.`;
  if (v === 1) return `${base} All checks passed under AutoExecute.`;
  if (v === 2) return `${base} Amount is over the approval threshold or mode is RequireApproval.`;
  const reasons: Record<number, string> = {
    1: "Mandate is not Active.",
    2: "Mandate expired.",
    3: "Caller is not the mandate's agent.",
    4: "Destination not in the approved set.",
    5: "Amount above per-tx limit.",
    6: "Amount exceeds today's remaining daily limit.",
  };
  return `${base} ${reasons[rule ?? -1] ?? ""}`;
}
