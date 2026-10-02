import {useAccount, useReadContracts} from "wagmi";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {formatUnits, erc20Abi} from "viem";
import {CONTRACTS, USDC_DECIMALS, isValid} from "../config/contracts";
import "./dashboard.css";

const vaultAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{name: "owner", type: "address"}],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "totalDeposits",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint256"}],
  },
] as const;

const fmt = (v: bigint | undefined) =>
  v === undefined ? "—" : Number(formatUnits(v, USDC_DECIMALS)).toLocaleString("en-US", {maximumFractionDigits: 2});

export function DashboardPage() {
  const {address} = useAccount();

  const canReadVault = isValid(CONTRACTS.vault) && !!address;

  const {data, isLoading, isError, refetch, isRefetching} = useReadContracts({
    contracts: canReadVault
      ? [
          {address: CONTRACTS.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address!]},
          {address: CONTRACTS.vault!, abi: vaultAbi, functionName: "balanceOf", args: [address!]},
          {address: CONTRACTS.vault!, abi: vaultAbi, functionName: "totalDeposits"},
        ]
      : [],
    query: {enabled: canReadVault},
  });

  const walletBal = data?.[0]?.result as bigint | undefined;
  const vaultBal = data?.[1]?.result as bigint | undefined;
  const totalDeposits = data?.[2]?.result as bigint | undefined;

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="crumbs">
          <span>MandateFi</span><span className="sep">/</span>
          <span className="current">Dashboard</span>
        </div>
        <div className="topbar-right">
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
        </div>
      </header>

      <main className="content">
        <div className="page-head">
          <div>
            <h1>Dashboard</h1>
            <div className="sub">
              Live from Sepolia · reading from <code>{short(CONTRACTS.vault)}</code>
            </div>
          </div>
          <button className="btn-ghost" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching ? "Refreshing…" : "Refresh ↻"}
          </button>
        </div>

        {!isValid(CONTRACTS.vault) && (
          <div className="warn-banner">
            VITE_MANDATE_VAULT_ADDRESS is not configured. Add it to <code>.env</code> and restart.
          </div>
        )}

        <div className="stat-grid">
          <Stat label="Your vault balance" value={fmt(vaultBal)} unit="USDC" loading={isLoading} />
          <Stat label="Your wallet USDC" value={fmt(walletBal)} unit="USDC" loading={isLoading} />
          <Stat label="Total vault deposits" value={fmt(totalDeposits)} unit="USDC" loading={isLoading} />
          <Stat label="Connected as" value={short(address)} mono loading={false} />
        </div>

        {isError && (
          <div className="err-banner">
            Failed to read contract state. Check network &amp; RPC, then refresh.
          </div>
        )}

        <div className="hint-panel">
          <h3>Next</h3>
          <p>
            This Dashboard is live-reading the deployed MandateVault at
            <code> {short(CONTRACTS.vault)}</code>. Your vault balance will be <strong>0</strong>
            until you deposit — the Vault view (coming next) will handle approve → deposit.
          </p>
          <p className="muted">
            Addresses are in <code>frontend/.env</code>. Full ABIs will be imported from
            <code> frontend/src/abi/</code> once the Vault / Registry / Executor hooks land.
          </p>
        </div>
      </main>
    </div>
  );
}

function Stat({label, value, unit, mono, loading}: {label: string; value: string; unit?: string; mono?: boolean; loading: boolean}) {
  return (
    <div className="stat">
      <div className="lbl">{label}</div>
      <div className={`val ${mono ? "mono" : ""}`}>
        {loading ? <span className="skeleton" /> : value}
        {unit && !loading && <span className="unit">{unit}</span>}
      </div>
    </div>
  );
}

function short(a?: string) {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
