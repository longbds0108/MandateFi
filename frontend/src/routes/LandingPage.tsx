import {useNavigate} from "react-router-dom";
import "./landing.css";

export function LandingPage() {
  const navigate = useNavigate();

  const launchApp = () => {
    // Navigate to app; AppGate will auto-open the RainbowKit connect modal
    // if the wallet isn't already connected, then route into Dashboard on connect.
    navigate("/app");
  };

  return (
    <div className="landing">
      <header className="hdr">
        <div className="brand">
          <span className="seal">M</span>
          <span>MandateFi</span>
        </div>
        <button className="btn-connect" onClick={launchApp}>Launch app</button>
      </header>

      <section className="hero">
        <div className="kicker">POLICY-CONTROLLED VAULT · ETHEREUM SEPOLIA</div>
        <h1>
          Your capital<br />
          should move<br />
          <em>within limits</em>
        </h1>
        <p className="lede">
          MandateFi is a policy-controlled DeFi vault. You sign a mandate on-chain,
          and an AI agent manages your test USDC strictly inside the per-tx, daily
          and destination rules you approved.
        </p>
        <div className="cta-row">
          <button className="btn-launch" onClick={launchApp}>
            <span className="label">Launch app</span>
            <span className="arrow">↗</span>
          </button>
          <a className="btn-ghost" href="/" onClick={(e) => { e.preventDefault(); window.location.href = "/"; }}>
            Read the landing →
          </a>
        </div>
      </section>
    </div>
  );
}
