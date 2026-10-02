import {Outlet} from "react-router-dom";
import {useAccount, useChainId, useSwitchChain} from "wagmi";
import {sepolia} from "wagmi/chains";
import "./app-gate.css";

/**
 * The app is intentionally browsable without a wallet. This makes the policy
 * surface inspectable before a user connects; writes still require a Sepolia wallet.
 */
export function AppGate() {
  const {isConnected, address} = useAccount();
  const chainId = useChainId();
  const {switchChain, isPending: isSwitching} = useSwitchChain();

  if (isConnected && chainId !== sepolia.id) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="kicker">WRONG NETWORK</div>
          <h1>Switch to <em>Sepolia</em></h1>
          <p>
            Connected as <code>{short(address)}</code> on chain {chainId}. MandateFi only
            writes to Ethereum Sepolia (chain id 11155111).
          </p>
          <button className="btn-switch" disabled={isSwitching} onClick={() => switchChain({chainId: sepolia.id})}>
            {isSwitching ? "Switching…" : "Switch to Sepolia"}
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

function short(a?: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}
