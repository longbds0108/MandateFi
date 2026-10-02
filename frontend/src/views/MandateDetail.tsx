import {useEffect, useMemo} from "react";
import {useNavigate, useSearchParams} from "react-router-dom";
import {useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract} from "wagmi";
import {formatUnits, isAddress, type Address} from "viem";
import {mandateRegistryAbi} from "../abi/MandateRegistry";
import {policyExecutorAbi} from "../abi/PolicyExecutor";
import {CONTRACTS, USDC_DECIMALS, isValid} from "../config/contracts";
import {decodeTxError} from "../lib/txErrors";

type Mandate = {
  id: bigint; owner: string; agent: string; perTxLimit: bigint; dailyLimit: bigint;
  approvalThreshold: bigint; apyTriggerBps: bigint; reserveDestination: string;
  executionMode: number; expiry: bigint; status: number; usedToday: bigint;
};
type Proposal = {
  id: bigint; mandateId: bigint; agent: string; destination: string; amount: bigint;
  verdict: number; state: number; createdAt: bigint;
};

export function MandateDetail() {
  const {address} = useAccount();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedId = params.get("id");
  const {data: nextId} = useReadContract({
    address: CONTRACTS.registry, abi: mandateRegistryAbi, functionName: "nextMandateId",
    query: {enabled: isValid(CONTRACTS.registry), refetchInterval: 15_000},
  });
  const id = useMemo(() => {
    try { return requestedId && BigInt(requestedId) > 0n ? BigInt(requestedId) : (nextId && nextId > 1n ? nextId - 1n : 0n); }
    catch { return 0n; }
  }, [requestedId, nextId]);
  const enabled = isValid(CONTRACTS.registry) && id > 0n;
  const {data, refetch, isLoading, isError, error: mandateError} = useReadContract({
    address: CONTRACTS.registry, abi: mandateRegistryAbi, functionName: "getMandate", args: enabled ? [id] : undefined,
    query: {enabled, refetchInterval: 12_000},
  });
  const {data: destinationData} = useReadContract({
    address: CONTRACTS.registry, abi: mandateRegistryAbi, functionName: "getDestinations", args: enabled ? [id] : undefined,
    query: {enabled},
  });
  const tx = useWriteContract();
  const receipt = useWaitForTransactionReceipt({hash: tx.data});
  const mandate = data as Mandate | undefined;
  const destinations = (destinationData as Address[] | undefined) ?? [];
  const executorAddr = CONTRACTS.executor;
  const {data: nextProposalId, refetch: refetchProposals} = useReadContract({
    address: executorAddr,
    abi: policyExecutorAbi,
    functionName: "nextProposalId",
    query: {enabled: isValid(executorAddr), refetchInterval: 12_000},
  });
  const proposalIds = useMemo(
    () => Array.from({length: Math.max(0, Number(nextProposalId ?? 1n) - 1)}, (_, index) => BigInt(index + 1)),
    [nextProposalId],
  );
  const {data: proposalResults, isLoading: proposalsLoading, refetch: refetchProposalRecords} = useReadContracts({
    contracts: isValid(executorAddr)
      ? proposalIds.map((proposalId) => ({address: executorAddr, abi: policyExecutorAbi, functionName: "getProposal" as const, args: [proposalId] as const}))
      : [],
    query: {enabled: isValid(executorAddr) && proposalIds.length > 0, refetchInterval: 12_000},
  });
  const proposals = useMemo(
    () => (proposalResults ?? []).flatMap((result) => result.status === "success" && result.result ? [result.result as Proposal] : []),
    [proposalResults],
  );
  const mandateProposals = useMemo(
    () => proposals.filter((proposal) => proposal.mandateId === id).sort((a, b) => Number(b.id - a.id)),
    [proposals, id],
  );
  const pendingCount = mandateProposals.filter((proposal) => proposal.state === 1).length;
  const now = Math.floor(Date.now() / 1000);
  const isOwner = !!mandate && mandate.owner.toLowerCase() === address?.toLowerCase();
  const expired = !!mandate && Number(mandate.expiry) <= now;

  useEffect(() => {
    if (!receipt.isSuccess) return;
    refetch();
    refetchProposals();
    refetchProposalRecords();
  }, [receipt.isSuccess, refetch, refetchProposals, refetchProposalRecords]);
  function changeStatus(action: "pause" | "resume" | "revoke") {
    if (!enabled) return;
    tx.writeContract({address: CONTRACTS.registry, abi: mandateRegistryAbi, functionName: action, args: [id]});
  }
  function resolveProposal(action: "approveProposal" | "rejectProposal", proposalId: bigint) {
    if (!isOwner || !isValid(executorAddr)) return;
    tx.writeContract({address: executorAddr, abi: policyExecutorAbi, functionName: action, args: [proposalId]});
  }
  function selectId(value: string) { setParams(value ? {id: value} : {}); }

  if (nextId === undefined) return <div className="panel-body" style={{color: "var(--color-text-secondary)"}}>Loading registry from Sepolia…</div>;
  if (nextId === 1n) {
    return requestedId ? <Unavailable navigate={navigate} /> : <Empty navigate={navigate} />;
  }
  if (isLoading) return <div className="panel-body" style={{color: "var(--color-text-secondary)"}}>Loading mandate from Sepolia…</div>;
  if (isError || !mandate) {
    return <Unavailable navigate={navigate} notFound={mandateError?.message?.includes("MandateNotFound")} />;
  }

  const used = percent(mandate.usedToday, mandate.dailyLimit);
  const status = statusName(mandate, now);
  const error = decodeTxError(tx.error);
  return <>
    <div className="page-head">
      <div>
        <div style={{display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap"}}><h1>Mandate #{mandate.id.toString()}</h1><span className={`badge ${status.toLowerCase()}`}>{status}</span></div>
        <div className="sub">A live, on-chain policy. The owner can pause or revoke it immediately.</div>
      </div>
      <div className="page-head-actions">
        <select aria-label="Mandate" value={id.toString()} onChange={(event) => selectId(event.target.value)} style={{padding: "8px 10px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-primary)"}}>
          {Array.from({length: Math.min(Number(nextId - 1n), 64)}, (_, index) => index + 1).map((value) => <option key={value} value={value}>Mandate #{value}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/agent?mandate=${id.toString()}`)}>Open agent console</button>
      </div>
    </div>

    <div className="grid-2">
      <section className="glass">
        <div className="panel-head"><h3>Policy limits</h3><span className="sub">Signed by {short(mandate.owner)}</span></div>
        <div className="panel-body">
          <div className="grid-3">
            <Rule label="Per transaction" value={amount(mandate.perTxLimit)} unit="USDC" detail="Hard cap for every proposal" />
            <Rule label="Daily limit" value={amount(mandate.dailyLimit)} unit="USDC" detail="Resets at the UTC day boundary" />
            <Rule label="Approval threshold" value={amount(mandate.approvalThreshold)} unit="USDC" detail="Above this, owner approval is required" />
            <Rule label="APY floor" value={(Number(mandate.apyTriggerBps) / 100).toFixed(2)} unit="%" detail="Yield-monitoring trigger" />
            <Rule label="Execution" value={mandate.executionMode === 0 ? "Auto" : "Manual"} detail={mandate.executionMode === 0 ? "Policy-approved transfers execute now" : "Every proposal needs an owner signature"} />
            <Rule label="Expires" value={date(mandate.expiry)} detail={expired ? "This mandate has expired" : `${daysLeft(mandate.expiry)} days remaining`} />
          </div>
        </div>
      </section>
      <section className="glass">
        <div className="panel-head"><h3>Daily capacity</h3><span className="sub">Live registry counter</span></div>
        <div className="panel-body" style={{display: "flex", justifyContent: "center", padding: 28}}>
          <div className="gauge-ring"><svg viewBox="0 0 180 180"><circle className="track" cx="90" cy="90" r="72" /><circle className={`fill-arc ${used >= 90 ? "danger" : used >= 70 ? "warn" : "safe"}`} cx="90" cy="90" r="72" strokeDasharray="452.4" strokeDashoffset={452.4 * (1 - used / 100)} /></svg><div className="center"><span className="big">{used}%</span><span className="cap">used today</span></div></div>
        </div>
        <div style={{padding: "0 20px 20px", display: "flex", justifyContent: "space-between", color: "var(--color-text-secondary)", fontSize: "0.8rem"}}><span>{amount(mandate.usedToday)} used</span><span>{amount(mandate.dailyLimit - mandate.usedToday)} USDC left</span></div>
      </section>
    </div>

    <div className="grid-2" style={{marginTop: 20}}>
      <section className="glass">
        <div className="panel-head"><h3>Approved destinations</h3><span className="sub">{destinations.length} allowlisted</span></div>
        <div className="panel-body"><div className="chip-list">{destinations.map((destination) => <a className="chip" key={destination} href={`https://sepolia.etherscan.io/address/${destination}`} target="_blank" rel="noreferrer">{short(destination)} ↗</a>)}</div><div style={{marginTop: 18, color: "var(--color-text-secondary)", fontSize: "0.8rem"}}>Reserve: <code>{short(mandate.reserveDestination)}</code></div></div>
      </section>
      <section className="glass">
        <div className="panel-head"><h3>Safety controls</h3><span className="sub">Owner-only transactions</span></div>
        <div className="panel-body">
          {!isOwner ? <p style={{color: "var(--color-text-secondary)", lineHeight: 1.5}}>Connect the mandate owner wallet ({short(mandate.owner)}) to change this policy.</p> : <div style={{display: "flex", gap: 10, flexWrap: "wrap"}}>
            {mandate.status === 1 && !expired && <button className="btn btn-ghost btn-sm" disabled={tx.isPending || receipt.isLoading} onClick={() => changeStatus("pause")}>Pause mandate</button>}
            {mandate.status === 2 && !expired && <button className="btn btn-primary btn-sm" disabled={tx.isPending || receipt.isLoading} onClick={() => changeStatus("resume")}>Resume mandate</button>}
            {mandate.status !== 3 && <button className="btn btn-danger btn-sm" disabled={tx.isPending || receipt.isLoading} onClick={() => changeStatus("revoke")}>Revoke permanently</button>}
          </div>}
          <div style={{marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--color-border)"}}>
            <div style={{display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10}}>
              <strong style={{fontSize: "0.88rem"}}>On-chain proposals</strong>
              <span className="sub">{pendingCount} pending</span>
            </div>
            {proposalsLoading ? <p style={{color: "var(--color-text-secondary)", fontSize: "0.82rem"}}>Loading proposal records from Sepolia…</p> : mandateProposals.length === 0 ? <p style={{color: "var(--color-text-secondary)", fontSize: "0.82rem"}}>No proposals recorded for this mandate.</p> : <div style={{display: "grid", gap: 8}}>{mandateProposals.map((proposal) => <div key={proposal.id.toString()} style={{padding: "10px 0", borderTop: "1px solid rgba(42,36,56,.62)"}}>
              <div style={{display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center"}}><span style={{fontWeight: 600}}>Proposal #{proposal.id.toString()}</span><span className={`badge ${proposalStateClass(proposal.state)}`}>{proposalStateName(proposal.state)}</span></div>
              <div style={{marginTop: 5, color: "var(--color-text-secondary)", fontSize: "0.78rem"}}>{amount(proposal.amount)} USDC → {short(proposal.destination)}</div>
              {isOwner && proposal.state === 1 && <div style={{display: "flex", gap: 8, marginTop: 10}}><button className="btn btn-primary btn-sm" disabled={tx.isPending || receipt.isLoading} onClick={() => resolveProposal("approveProposal", proposal.id)}>Approve & execute</button><button className="btn btn-ghost btn-sm" disabled={tx.isPending || receipt.isLoading} onClick={() => resolveProposal("rejectProposal", proposal.id)}>Reject</button></div>}
            </div>)}</div>}
          </div>
          {receipt.isSuccess && <div className="chip" style={{marginTop: 14, borderColor: "rgba(79,209,197,.4)", color: "var(--color-safe)"}}>✓ Confirmed in block {receipt.data?.blockNumber?.toString()}</div>}
          {error && <p style={{marginTop: 14, color: "var(--color-danger)", fontSize: "0.84rem"}}>{error}</p>}
        </div>
      </section>
    </div>
  </>;
}

function Empty({navigate}: {navigate: ReturnType<typeof useNavigate>}) { return <div className="form-section" style={{maxWidth: 620, margin: "50px auto"}}><h3>No mandates created</h3><p className="section-sub">Create a mandate to set the exact bounds an agent must follow.</p><button className="btn btn-primary" onClick={() => navigate("/create")}>Create mandate</button></div>; }
function Unavailable({navigate, notFound = true}: {navigate: ReturnType<typeof useNavigate>; notFound?: boolean}) { return <div className="form-section" style={{maxWidth: 620, margin: "50px auto"}}><h3>Mandate unavailable</h3><p className="section-sub">{notFound ? "This mandate does not exist." : "The mandate could not be read from Sepolia. Check the ID and try again."}</p><button className="btn btn-primary" onClick={() => navigate("/dashboard")}>Back to dashboard</button></div>; }
function Rule({label, value, unit, detail}: {label: string; value: string; unit?: string; detail: string}) { return <div className="rule"><div className="rlbl">{label}</div><div className="rval">{value}{unit && <span className="unit">{unit}</span>}</div><div className="rsub">{detail}</div></div>; }
function amount(value: bigint) { return Number(formatUnits(value, USDC_DECIMALS)).toLocaleString("en-US", {maximumFractionDigits: 2}); }
function percent(used: bigint, limit: bigint) { return limit === 0n ? 0 : Math.min(100, Math.round(Number((used * 10_000n) / limit) / 100)); }
function short(value: string) { return isAddress(value) ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—"; }
function date(value: bigint) { return new Date(Number(value) * 1000).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"}); }
function daysLeft(value: bigint) { return Math.max(0, Math.ceil((Number(value) * 1000 - Date.now()) / 86_400_000)); }
function statusName(mandate: Mandate, now: number) { if (Number(mandate.expiry) <= now) return "Expired"; return ["Unknown", "Active", "Paused", "Revoked"][mandate.status] ?? "Unknown"; }
function proposalStateName(state: number) { return ["None", "Pending", "Approved", "Rejected", "Executed", "Expired"][state] ?? "Unknown"; }
function proposalStateClass(state: number) { return state === 1 ? "approval" : state === 4 ? "active" : state === 3 ? "revoked" : ""; }
