import {NavLink, Outlet, useLocation, useNavigate} from "react-router-dom";
import {useEffect, useState} from "react";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import "../styles/app-shell.css";

const VIEW_PATHS: Record<string, string> = {
  dashboard: "/dashboard",
  vault: "/vault",
  create: "/create",
  detail: "/detail",
  agent: "/agent",
  trace: "/trace",
};

const CRUMBS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/vault": "Vault",
  "/create": "Create mandate",
  "/detail": "Mandate detail",
  "/agent": "Agent console",
  "/trace": "Policy trace",
};

const NAV = [
  {group: "Overview", items: [{to: "/dashboard", label: "Dashboard", ic: "▣"}]},
  {group: "Capital", items: [{to: "/vault", label: "Vault", ic: "◧"}]},
  {
    group: "Mandates",
    items: [
      {to: "/create", label: "Create mandate", ic: "+"},
      {to: "/detail", label: "Mandate detail", ic: "⟐"},
    ],
  },
  {
    group: "Operations",
    items: [
      {to: "/agent", label: "Agent console", ic: "◉"},
      {to: "/trace", label: "Policy trace", ic: "≡"},
    ],
  },
];

export function AppShellLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const crumb = CRUMBS[location.pathname] ?? "Dashboard";

  useEffect(() => {
    document.title = `MandateFi · ${crumb}`;
    setOpen(false);
  }, [crumb]);

  // Delegate clicks on inner [data-view="..."] elements (buttons/anchors inside
  // the raw HTML views) to React Router so cross-view CTAs actually navigate.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-view]");
      if (!target) return;
      const view = target.getAttribute("data-view");
      if (!view) return;
      const path = VIEW_PATHS[view];
      if (!path) return;
      e.preventDefault();
      navigate(path);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [navigate]);

  return (
    <>
      <aside className={`sidebar ${open ? "open" : ""}`} id="sidebar">
        <NavLink to="/dashboard" className="brand">
          <span className="seal">M</span>
          <span>MandateFi</span>
        </NavLink>
        <nav>
          {NAV.map((group, i) => (
            <div className="nav-group" key={group.group} style={{marginTop: i === 0 ? 0 : 18}}>
              <div className="nav-group-label">{group.group}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({isActive}) => `nav-item ${isActive ? "active" : ""}`}
                >
                  <span className="ic">{item.ic}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="flag">Testnet MVP</div>
          Sepolia · USDC · do not deposit real funds.
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            className="menu-toggle"
            aria-label="Open menu"
            onClick={() => setOpen((o) => !o)}
          >
            ≡
          </button>
          <div className="crumbs">
            <span>MandateFi</span>
            <span className="sep">/</span>
            <span className="current">{crumb}</span>
          </div>
          <div className="topbar-right">
            <ConnectButton.Custom>
              {({
                account,
                chain,
                mounted,
                openAccountModal,
                openChainModal,
                openConnectModal,
              }) => {
                const connected = mounted && Boolean(account && chain);

                if (!connected) {
                  return (
                    <>
                      <button className="network-control" onClick={openChainModal} title="Select network">
                        <span className="network-status" aria-hidden="true" />
                        <span>Sepolia</span>
                      </button>
                      <button className="wallet-control wallet-connect" onClick={openConnectModal}>
                        Connect wallet
                        <ChevronDown />
                      </button>
                    </>
                  );
                }

                if (chain?.unsupported) {
                  return (
                    <button className="network-control network-unsupported" onClick={openChainModal}>
                      Wrong network
                      <ChevronDown />
                    </button>
                  );
                }

                return (
                  <>
                    <button className="network-control" onClick={openChainModal} title="Change network">
                      <span className="network-status" aria-hidden="true" />
                      <span>{chain?.name ?? "Sepolia"}</span>
                    </button>
                    <button className="wallet-control" onClick={openAccountModal} title="Open wallet menu">
                      <span className="wallet-avatar" aria-hidden="true">
                        {account?.ensAvatar ? <img src={account.ensAvatar} alt="" /> : "M"}
                      </span>
                      <span>{account?.displayName}</span>
                      <ChevronDown />
                    </button>
                  </>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </>
  );
}

function ChevronDown() {
  return (
    <svg className="wallet-chevron" viewBox="0 0 16 10" aria-hidden="true">
      <path d="m1 1 7 7 7-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  );
}
