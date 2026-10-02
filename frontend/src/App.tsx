import {Routes, Route, Navigate} from "react-router-dom";
import {AppGate} from "./routes/AppGate";
import {DashboardPage} from "./routes/DashboardPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppGate />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
