import './App.css'
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { getToken } from "./api/client";

import AIDecisionSupport from "./Pages/AIDecisionSupport";

import Landing from "./Pages/Landing";
import Dashboard from "./Pages/Dashboard";
import AI from "./Pages/AI";
import AI_Assistant from "./Pages/AI_assistant";
import Alerts from "./Pages/Alerts";
import Analytics from "./Pages/Analytics";
import Decision from "./Pages/Decision";
import Knowledge from "./Pages/Knowledge";
import Login from "./Pages/Login";
import Monitoring from "./Pages/Monitoring";
import Monitoringg from "./Pages/Monitoringg";
import Register from "./Pages/Register";
import Reports from "./Pages/Reports";
import Support from "./Pages/Support";

function RequireAuth({ children }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>

      <Routes>
        <Route path="/" element={<Landing />} />

        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />

        <Route path="/login" element={<Login />} />

        <Route path="/register" element={<Register />} />

        <Route
          path="/monitoring/:diverId"
          element={<Monitoring />}
        />

        <Route
          path="/risk"
          element={<AI />}
        />

        <Route path="/alerts" element={<Alerts />} />

        <Route
          path="/analytics"
          element={<Analytics />}
        />

        <Route
          path="/reports"
          element={<Reports />}
        />

        <Route
          path="/assistant"
          element={<AI_Assistant />}
        />

        <Route
          path="/decision"
          element={
            <RequireAuth>
              <Decision />
            </RequireAuth>
          }
        />

        <Route
          path="/knowledge"
          element={<Knowledge />}
        />

        <Route
          path="/support"
          element={<Support />}
        />

        <Route
          path="/ai-decision-support"
          element={<AIDecisionSupport />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App;