import { useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { OnboardingGate } from "./components/OnboardingGate";
import { Landing } from "./pages/Landing";
import { Welcome } from "./pages/Welcome";
import { Onboarding } from "./pages/Onboarding";
import { Auth } from "./pages/Auth";
import { Dashboard } from "./pages/Dashboard";
import { Contacts } from "./pages/Contacts";
import { Applications } from "./pages/Applications";
import { Resumes } from "./pages/Resumes";
import { Pipeline } from "./pages/Pipeline";
import { Calendar } from "./pages/Calendar";
import { Settings } from "./pages/Settings";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { addBreadcrumb } from "./lib/telemetry";
import "./pages/EntityForm.css";

/** Records each route change so an error report shows how the user got there. */
function RouteBreadcrumbs() {
  const { pathname } = useLocation();
  useEffect(() => {
    addBreadcrumb("navigation", pathname);
  }, [pathname]);
  return null;
}

/** "/" is the public landing for visitors, the dashboard for users. */
function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" aria-hidden />
      </div>
    );
  }

  return user ? <Navigate to="/dashboard" replace /> : <Landing />;
}

export default function App() {
  return (
    <ErrorBoundary context="app">
      <AuthProvider>
        <BrowserRouter>
          <RouteBreadcrumbs />
          <Routes>
          <Route path="/" element={<Home />} />
          {/* Signed-in welcome page. Reached from the sidebar logo; "/" can't
              serve it because it redirects logged-in users to the dashboard. */}
          <Route
            path="/welcome"
            element={
              <ProtectedRoute>
                <Welcome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            }
          />
          <Route path="/signin" element={<Auth mode="signin" />} />
          <Route path="/signup" element={<Auth mode="signup" />} />
          {/* Old bookmark compatibility */}
          <Route path="/login" element={<Navigate to="/signin" replace />} />

          <Route
            element={
              <ProtectedRoute>
                <OnboardingGate>
                  <Layout />
                </OnboardingGate>
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="applications" element={<Applications />} />
            <Route path="resumes" element={<Resumes />} />
            <Route path="settings" element={<Settings />} />
          </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
