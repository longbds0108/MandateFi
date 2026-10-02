import {useMemo} from "react";
import {useNavigate} from "react-router-dom";
import {useAccount, useReadContract, useReadContracts} from "wagmi";
import {erc20Abi, formatUnits} from "viem";
import {mandateRegistryAbi} from "../abi/MandateRegistry";
import {mandateVaultAbi} from "../abi/MandateVault";
import {CONTRACTS, USDC_DECIMALS, isValid} from "../config/contracts";

type Mandate = {
  id: bigint; owner: string; agent: string; perTxLimit: bigint; dailyLimit: bigint;
  approvalThreshold: bigint; expiry: bigint; status: number; usedToday: bigint;
};

export function Dashboard() {
  const {address} = useAccount();
  const navigate = useNavigate();
  const canReadProtocol = isValid(CONTRACTS.vault) && isValid(CONTRACTS.registry);
  const {data: nextId} = useReadContract({
    address: CONTRACTS.registry, abi: mandateRegistryAbi, functionName: "nextMandateId",
    query: {enabled: canReadProtocol, refetchInterval: 15_000},
  });
  const total = Math.min(Math.max(Number(nextId ?? 1n) - 1, 0), 64);
  const ids = useMemo(() => Array.from({length: total}, (_, index) => BigInt(index + 1)), [total]);
  const {data: balances} = useReadContracts({
    contracts: canReadProtocol ? [
      ...(address ? [
        {address: CONTRACTS.vault, abi: mandateVaultAbi, functionName: "balanceOf" as const, args: [address] as const},
        {address: CONTRACTS.usdc, abi: erc20Abi, functionName: "balanceOf" as const, args: [address] as const},
      ] : []),
      {address: CONTRACTS.vault, abi: mandateVaultAbi, functionName: "totalDeposits" as const},
    ] : [],
    query: {enabled: canReadProtocol, refetchInterval: 10_000},
  });
  const {data: mandateResults, isLoading: mandatesLoading} = useReadContracts({
    contracts: canReadProtocol ? ids.map((id) => ({address: CONTRACTS.registry, abi: mandateRegistryAbi, functionName: "getMandate" as const, args: [id] as const})) : [],
    query: {enabled: canReadProtocol && ids.length > 0, refetchInterval: 15_000},
  });
  const vaultBalance = address ? (balances?.[0]?.result as bigint | undefined) ?? 0n : 0n;
  const walletBalance = address ? (balances?.[1]?.result as bigint | undefined) ?? 0n : 0n;
  const totalIndex = address ? 2 : 0;
  const totalDeposits = (balances?.[totalIndex]?.result as bigint | undefined) ?? 0n;
  const mandates = useMemo(() => (mandateResults ?? []).flatMap((item) => item.status === "success" && item.result ? [item.result as Mandate] : []), [mandateResults]);
  const mine = useMemo(() => mandates.filter((m) => m.owner.toLowerCase() === address?.toLowerCase()), [mandates, address]);
  const now = Math.floor(Date.now() / 1000);
  const active = mine.filter((m) => m.status === 1 && Number(m.expiry) > now);
  const dailyRemaining = active.reduce((sum, m) => sum + (m.dailyLimit - m.usedToday), 0n);

  return <>
    <div className="page-head">
      <div><h1>Control center</h1><div className="sub">Your capital and active policy guardrails on Sepolia.</div></div>
      <div className="page-head-actions"><button className="btn btn-ghost btn-sm" onClick={() => navigate("/vault")}>Manage vault</button><button className="btn btn-primary btn-sm" onClick={() => navigate("/create")}>Create mandate</button></div>
    </div>
    <div className="stat-grid">
      <Stat label="Vault balance" value={address ? amount(vaultBalance) : "—"} unit={address ? "USDC" : undefined} detail={`Protocol total: ${amount(totalDeposits)} USDC`} />
      <Stat label="Wallet balance" value={address ? amount(walletBalance) : "—"} unit={address ? "USDC" : undefined} detail={address ? short(address) : "Connect wallet to view"} />
      <Stat label="Active mandates" value={String(active.length)} detail={mine.length ? `${mine.length} mandate${mine.length === 1 ? "" : "s"} owned` : "No mandates created yet"} />
      <Stat label="Today’s available capacity" value={amount(dailyRemaining)} unit="USDC" detail="Across active mandates" />
    </div>
    <div className="grid-2">
      <section className="glass">
        <div className="panel-head"><div><h3>Your mandates</h3><span className="sub">Live registry state</span></div><button className="btn btn-ghost btn-sm" onClick={() => navigate("/trace")}>Policy trace</button></div>
        {mandatesLoading ? <div className="panel-body" style={{color: "var(--color-text-secondary)"}}>Loading mandates from Sepolia…</div> : mine.length === 0 ? <Empty onCreate={() => navigate("/create")} /> : mine.slice().reverse().map((mandate) => {
          const used = percent(mandate.usedToday, mandate.dailyLimit);
          return <button className="mrow" key={mandate.id.toString()} onClick={() => navigate(`/detail?id=${mandate.id}`)}>
            <div style={{textAlign: "left"}}><div className="name">Mandate #{mandate.id.toString()}</div><div className="meta">Agent {short(mandate.agent)}</div></div>
            <div style={{textAlign: "left"}}><span className={`badge ${statusClass(mandate, now)}`}>{statusName(mandate, now)}</span></div>
            <div className="usage"><div className="usage-top"><span>Daily usage</span><span>{used}%</span></div><div className={`progress ${used >= 90 ? "danger" : used >= 70 ? "warn" : ""}`}><div className="fill" style={{width: `${used}%`}} /></div></div>
            <div className="expiry">Expires {date(mandate.expiry)}</div><span style={{color: "var(--color-accent)"}}>View →</span>
          </button>;
        })}
      </section>
      <section className="glass">
        <div className="panel-head"><h3>Safe workflow</h3><span className="sub">On-chain enforcement</span></div>
        <div className="panel-body" style={{display: "grid", gap: 16}}>
          <Workflow n="01" title="Fund the vault" text="Approve Circle test USDC, then deposit. You can withdraw at any time." action="Open vault" onClick={() => navigate("/vault")} />
          <Workflow n="02" title="Set the mandate" text="Choose agent, approved destinations, limits, approval threshold, and expiry." action="Create mandate" onClick={() => navigate("/create")} />
          <Workflow n="03" title="Review every action" text="Agent proposals are evaluated in the fixed policy order and written to the trace." action="Open console" onClick={() => navigate("/agent")} />
        </div>
      </section>
    </div>
  </>;
}

function Stat({label, value, unit, detail}: {label: string; value: string; unit?: string; detail: string}) { return <div className="stat"><div className="lbl">{label}</div><div className="val">{value}{unit && <span className="unit">{unit}</span>}</div><div className="delta">{detail}</div></div>; }
function Empty({onCreate}: {onCreate: () => void}) { return <div className="panel-body" style={{padding: 28}}><strong>No mandates yet.</strong><p style={{color: "var(--color-text-secondary)", marginTop: 8, marginBottom: 16}}>Create your first on-chain policy before an agent can move any funds.</p><button className="btn btn-primary btn-sm" onClick={onCreate}>Create mandate</button></div>; }
function Workflow({n, title, text, action, onClick}: {n: string; title: string; text: string; action: string; onClick: () => void}) { return <div style={{display: "grid", gridTemplateColumns: "34px 1fr", gap: 12}}><span className="badge" style={{height: 25, justifyContent: "center", color: "var(--color-accent)", borderColor: "var(--color-border)"}}>{n}</span><div><strong>{title}</strong><p style={{color: "var(--color-text-secondary)", fontSize: "0.84rem", lineHeight: 1.5, marginTop: 4, marginBottom: 9}}>{text}</p><button className="btn btn-ghost btn-sm" onClick={onClick}>{action}</button></div></div>; }
function amount(value: bigint) { return Number(formatUnits(value, USDC_DECIMALS)).toLocaleString("en-US", {maximumFractionDigits: 2}); }
function percent(used: bigint, limit: bigint) { return limit === 0n ? 0 : Math.min(100, Math.round(Number((used * 10000n) / limit) / 100)); }
function short(value?: string) { return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—"; }
function date(value: bigint) { return new Date(Number(value) * 1000).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"}); }
function statusName(mandate: Mandate, now: number) { if (Number(mandate.expiry) <= now) return "Expired"; return ["Unknown", "Active", "Paused", "Revoked"][mandate.status] ?? "Unknown"; }
function statusClass(mandate: Mandate, now: number) { return statusName(mandate, now).toLowerCase(); }
