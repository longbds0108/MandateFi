import {useEffect, useState, useMemo} from "react";
import {usePublicClient} from "wagmi";
import {formatUnits, type Log} from "viem";
import {policyExecutorAbi} from "../abi/PolicyExecutor";
import {CONTRACTS, POLICY_EXECUTOR_DEPLOYMENT_BLOCK, USDC_DECIMALS, isValid} from "../config/contracts";

type Verdict = 0 | 1 | 2;
type Row = {
  blockNumber: bigint;
  txHash: string;
  mandateId: bigint;
  proposalId: bigint;
  agent: string;
  destination: string;
  amount: bigint;
  verdict: Verdict;
  ruleHit: number;
  ts?: number;
};

type Filter = "all" | "allowed" | "approval" | "denied";
type SyncState = "loading" | "ready" | "error";

export function PolicyTrace() {
  const client = usePublicClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [range, setRange] = useState<{from: bigint; to: bigint}>();
  const [syncError, setSyncError] = useState("");
  const executorAddr = CONTRACTS.executor;

  // Backfill: pull the most recent events on mount (last ~20k blocks ≈ 3 days on Sepolia)
  useEffect(() => {
    if (!client || !isValid(executorAddr)) return;
    let cancelled = false;
    let interval: number | undefined;
    (async () => {
      try {
        setSyncState("loading");
        setSyncError("");
        const latest = await client.getBlockNumber();
        const from = POLICY_EXECUTOR_DEPLOYMENT_BLOCK > latest ? latest : POLICY_EXECUTOR_DEPLOYMENT_BLOCK;
        const logs = await getPolicyCheckedEvents(client, executorAddr, from, latest);
        if (cancelled) return;
        setRows((previous) => mergeRows(logs.map(logToRow), previous));
        setRange({from, to: latest});
        setSyncState("ready");
        let lastSeenBlock = latest;
        const poll = async () => {
          try {
            const current = await client.getBlockNumber();
            if (current <= lastSeenBlock) return;
            const newLogs = await getPolicyCheckedEvents(client, executorAddr, lastSeenBlock + 1n, current);
            if (cancelled) return;
            setRows((previous) => mergeRows(newLogs.map(logToRow), previous));
            setRange((previous) => previous ? {...previous, to: current} : {from: lastSeenBlock + 1n, to: current});
            lastSeenBlock = current;
            setSyncState("ready");
          } catch {
            if (!cancelled) {
              setSyncState("error");
              setSyncError("The RPC did not return new PolicyChecked events. Refresh to retry.");
            }
          }
        };
        interval = window.setInterval(() => { void poll(); }, 12_000);
      } catch (e) {
        if (cancelled) return;
        setSyncState("error");
        setSyncError("The RPC did not return PolicyChecked events. Refresh to retry.");
      }
    })();
    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, [client, executorAddr]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    const want: Verdict = filter === "allowed" ? 1 : filter === "approval" ? 2 : 0;
    return rows.filter((r) => r.verdict === want);
  }, [rows, filter]);

  const counts = useMemo(() => {
    const c = {all: rows.length, allowed: 0, approval: 0, denied: 0};
    rows.forEach((r) => {
      if (r.verdict === 1) c.allowed++;
      else if (r.verdict === 2) c.approval++;
      else c.denied++;
    });
    return c;
  }, [rows]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Policy trace</h1>
          <div className="sub" style={{display: "flex", alignItems: "center", gap: 10}}>
            <span className="live-dot" aria-hidden="true" style={{background: syncState === "error" ? "var(--color-danger)" : undefined}} />
            <span style={{color: syncState === "error" ? "var(--color-danger)" : "var(--color-safe)", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.72rem"}}>
              {syncState === "loading" ? "Loading" : syncState === "error" ? "Unavailable" : "Confirmed"}
            </span>
            <span style={{color: "var(--color-text-secondary)"}}>
              {syncState === "error" ? "· Could not read PolicyChecked events from Sepolia" : range ? `· blocks ${range.from.toString()}–${range.to.toString()} on Sepolia` : "· reading Sepolia events"}
            </span>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <Chip on={filter === "all"} onClick={() => setFilter("all")} label="All" count={counts.all} />
        <Chip on={filter === "allowed"} onClick={() => setFilter("allowed")} label="Allowed" count={counts.allowed} />
        <Chip on={filter === "approval"} onClick={() => setFilter("approval")} label="Requires approval" count={counts.approval} />
        <Chip on={filter === "denied"} onClick={() => setFilter("denied")} label="Denied" count={counts.denied} />
      </div>

      <div className="glass">
        {syncState === "error" && <div style={{padding: "12px 16px", color: "var(--color-danger)", borderBottom: "1px solid rgba(229,72,77,.28)", fontSize: "0.82rem"}}>Unable to load the on-chain trace: {syncError}</div>}
        <table>
          <thead>
            <tr>
              <th>Block</th>
              <th>Mandate</th>
              <th className="num-cell">Amount</th>
              <th>Destination</th>
              <th>Verdict</th>
              <th>Rule</th>
              <th>Tx</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{textAlign: "center", color: "var(--color-text-secondary)", padding: 36}}>
                  {rows.length === 0 ? "No confirmed PolicyChecked events were found in the loaded block range." : "No events match this filter."}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={`${r.txHash}:${r.proposalId}`}>
                <td>{r.blockNumber.toString()}</td>
                <td>M#{r.mandateId.toString()}</td>
                <td className="num-cell">
                  <strong>{Number(formatUnits(r.amount, USDC_DECIMALS)).toLocaleString()}</strong> USDC
                </td>
                <td><code>{short(r.destination)}</code></td>
                <td>
                  <span className={`badge ${verdictClass(r.verdict)}`}>
                    {verdictGlyph(r.verdict)} {verdictName(r.verdict)}
                  </span>
                </td>
                <td style={{fontSize: "0.78rem"}}>{ruleText(r.verdict, r.ruleHit)}</td>
                <td>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${r.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{color: "var(--color-accent)"}}
                  >
                    <code>{short(r.txHash)} ↗</code>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function mergeRows(incoming: Row[], existing: Row[]) {
  const unique = new Map<string, Row>();
  for (const row of [...incoming, ...existing]) unique.set(`${row.txHash}:${row.proposalId.toString()}`, row);
  return [...unique.values()].sort((a, b) => (a.blockNumber === b.blockNumber ? Number(b.proposalId - a.proposalId) : a.blockNumber > b.blockNumber ? -1 : 1));
}

async function getPolicyCheckedEvents(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  executor: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const events = [] as Awaited<ReturnType<typeof client.getContractEvents>>;
  // The public Sepolia RPC limits eth_getLogs to 1,000 blocks. Querying in
  // 999-block windows preserves the complete trace without exceeding it.
  const window = 999n;
  for (let start = fromBlock; start <= toBlock;) {
    const end = start + window > toBlock ? toBlock : start + window;
    const chunk = await client.getContractEvents({
      address: executor,
      abi: policyExecutorAbi,
      eventName: "PolicyChecked",
      fromBlock: start,
      toBlock: end,
    });
    events.push(...chunk);
    start = end + 1n;
  }
  return events;
}

function logToRow(log: Log & {args?: any}): Row {
  const a = log.args ?? {};
  return {
    blockNumber: log.blockNumber ?? 0n,
    txHash: log.transactionHash ?? "0x",
    mandateId: a.mandateId ?? 0n,
    proposalId: a.proposalId ?? 0n,
    agent: a.agent ?? "0x",
    destination: a.destination ?? "0x",
    amount: a.amount ?? 0n,
    verdict: Number(a.verdict ?? 0) as Verdict,
    ruleHit: Number(a.ruleHit ?? 0),
  };
}
function Chip({label, count, on, onClick}: {label: string; count: number; on: boolean; onClick: () => void}) {
  return (
    <button className={`filter-chip ${on ? "on" : ""}`} onClick={onClick}>
      {label} <span className="count">{count}</span>
    </button>
  );
}
function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function verdictName(v: Verdict) { return v === 1 ? "Allowed" : v === 2 ? "Approval" : "Denied"; }
function verdictClass(v: Verdict) { return v === 1 ? "allowed" : v === 2 ? "approval" : "denied"; }
function verdictGlyph(v: Verdict) { return v === 1 ? "●" : v === 2 ? "○" : "✕"; }
function ruleText(v: Verdict, rule: number) {
  if (v === 1) return "All checks passed";
  if (v === 2) return "Over approval threshold";
  const reasons: Record<number, string> = {
    1: "Mandate not active",
    2: "Mandate expired",
    3: "Caller not agent",
    4: "Destination not approved",
    5: "Exceeds per-tx limit",
    6: "Exceeds daily limit",
  };
  return reasons[rule] ?? `Rule ${rule}`;
}
