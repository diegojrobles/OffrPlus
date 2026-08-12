import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getPreferences } from "../lib/jobs";

/**
 * Sends users who haven't completed the questionnaire to /onboarding.
 *
 * Deliberately fails open: if the preferences lookup errors (offline, RLS
 * misconfigured, migration not yet run) the user still reaches the app rather
 * than being trapped on a setup screen they can't get past.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [checked, setChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!user) return;
      try {
        const prefs = await getPreferences(user.id);
        if (!cancelled) setNeedsOnboarding(!prefs?.onboarded_at);
      } catch {
        if (!cancelled) setNeedsOnboarding(false);
      } finally {
        if (!cancelled) setChecked(true);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!checked) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" aria-hidden />
      </div>
    );
  }

  if (needsOnboarding && pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
