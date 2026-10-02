import {Routes, Route, Navigate} from "react-router-dom";
import {AppGate} from "./routes/AppGate";
import {AppShellLayout} from "./components/AppShellLayout";
import {Dashboard} from "./views/Dashboard";
import {Vault} from "./views/Vault";
import {CreateMandate} from "./views/CreateMandate";
import {MandateDetail} from "./views/MandateDetail";
import {AgentConsole} from "./views/AgentConsole";
import {PolicyTrace} from "./views/PolicyTrace";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppGate />}>
        <Route element={<AppShellLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="vault" element={<Vault />} />
          <Route path="create" element={<CreateMandate />} />
          <Route path="detail" element={<MandateDetail />} />
          <Route path="agent" element={<AgentConsole />} />
          <Route path="trace" element={<PolicyTrace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
