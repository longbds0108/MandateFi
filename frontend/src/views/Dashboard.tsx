import {useEffect, useRef} from "react";
import {useAccount, useReadContracts} from "wagmi";
import {erc20Abi, formatUnits} from "viem";
import {CONTRACTS, USDC_DECIMALS, isValid} from "../config/contracts";
import html from "./dashboard.html?raw";

const vaultAbi = [
  {type: "function", name: "balanceOf", stateMutability: "view", inputs: [{name: "o", type: "address"}], outputs: [{type: "uint256"}]},
  {type: "function", name: "totalDeposits", stateMutability: "view", inputs: [], outputs: [{type: "uint256"}]},
] as const;

const fmt = (v: bigint | undefined, dp = 0) =>
  v === undefined ? "—" : Number(formatUnits(v, USDC_DECIMALS)).toLocaleString("en-US", {maximumFractionDigits: dp});

export function Dashboard() {
  const ref = useRef<HTMLDivElement>(null);
  const {address} = useAccount();

  const can = isValid(CONTRACTS.vault) && !!address;
  const {data} = useReadContracts({
    contracts: can
      ? [
          {address: CONTRACTS.vault!, abi: vaultAbi, functionName: "balanceOf", args: [address!]},
          {address: CONTRACTS.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address!]},
          {address: CONTRACTS.vault!, abi: vaultAbi, functionName: "totalDeposits"},
        ]
      : [],
    query: {enabled: can, refetchInterval: 10_000},
  });

  const vaultBal = data?.[0]?.result as bigint | undefined;
  const walletBal = data?.[1]?.result as bigint | undefined;
  const totalDeposits = data?.[2]?.result as bigint | undefined;

  // Live-patch the first 2 stat cards' values with real on-chain data.
  useEffect(() => {
    if (!ref.current) return;
    const vals = ref.current.querySelectorAll(".stat .val");
    const deltas = ref.current.querySelectorAll(".stat .delta");

    if (vals[0]) {
      vals[0].innerHTML = `${fmt(vaultBal, 2)}<span class="unit">USDC</span>`;
    }
    if (vals[1]) {
      vals[1].innerHTML = `${fmt(walletBal, 2)}<span class="unit">USDC</span>`;
    }
    if (deltas[0]) {
      deltas[0].textContent = totalDeposits !== undefined
        ? `Vault total: ${fmt(totalDeposits, 0)} USDC`
        : "Live from Sepolia";
    }
    if (deltas[1]) {
      deltas[1].textContent = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";
    }
  }, [vaultBal, walletBal, totalDeposits, address]);

  return <div ref={ref} dangerouslySetInnerHTML={{__html: html}} />;
}
