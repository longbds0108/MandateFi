import {NavLink, Outlet, useLocation} from "react-router-dom";
import {useEffect, useState} from "react";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import "../styles/app-shell.css";

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
  const [open, setOpen] = useState(false);
  const crumb = CRUMBS[location.pathname] ?? "Dashboard";

  useEffect(() => {
    document.title = `MandateFi · ${crumb}`;
    setOpen(false);
  }, [crumb]);

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
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </>
  );
}
