import {Outlet, useLocation, useNavigate} from "react-router-dom";
import {useEffect, useRef} from "react";
import {useAccount, useChainId, useSwitchChain} from "wagmi";
import {sepolia} from "wagmi/chains";
import {ConnectButton, useConnectModal} from "@rainbow-me/rainbowkit";
import "./app-gate.css";

export function AppGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const {isConnected, address} = useAccount();
  const chainId = useChainId();
  const {openConnectModal} = useConnectModal();
  const {switchChain, isPending: isSwitching} = useSwitchChain();

  // Auto-open the connect modal when the user lands at /app without a wallet.
  // Fires once per mount; closing the modal without connecting leaves them on this screen.
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (!isConnected && !didAutoOpen.current && openConnectModal) {
      didAutoOpen.current = true;
      openConnectModal();
    }
  }, [isConnected, openConnectModal]);

  // Once connected, if we're sitting at the gate root hash, slide into the Dashboard.
  useEffect(() => {
    if (isConnected && location.pathname === "/") {
      navigate("/dashboard", {replace: true});
    }
  }, [isConnected, location.pathname, navigate]);

  if (!isConnected) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="brand">
            <span className="seal">M</span>
            <span>MandateFi</span>
          </div>
          <div className="kicker">CONNECT WALLET TO CONTINUE</div>
          <h1>
            Launch<br />
            <em>the protocol</em>
          </h1>
          <p>
            MandateFi runs on Ethereum Sepolia. Connect your wallet, make sure
            you're on Sepolia (chain id 11155111), and we'll take you to the
            dashboard.
          </p>
          <div className="gate-actions">
            <ConnectButton
              label="Connect wallet"
              accountStatus="address"
              chainStatus="icon"
              showBalance={false}
            />
            <a className="back" href="/">
              ← Back to landing
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Connected but on the wrong network
  if (chainId !== sepolia.id) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="kicker">WRONG NETWORK</div>
          <h1>Switch to <em>Sepolia</em></h1>
          <p>
            Connected as <code>{short(address)}</code> on chain {chainId}.
            MandateFi lives on Sepolia (chain id 11155111).
          </p>
          <button
            className="btn-switch"
            disabled={isSwitching}
            onClick={() => switchChain({chainId: sepolia.id})}
          >
            {isSwitching ? "Switching…" : "Switch to Sepolia"}
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

function short(a?: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
