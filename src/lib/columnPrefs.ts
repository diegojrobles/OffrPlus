import { useCallback, useEffect, useState } from "react";

/**
 * Remembers which table columns a user has toggled on/off.
 *
 * Preferences are keyed by column id and stored in localStorage. Unknown ids
 * (e.g. a custom field added after the prefs were saved) fall back to the
 * default passed in, so new columns show up rather than silently hiding.
 */
export function useColumnPrefs(storageKey: string) {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...hidden]));
    } catch {
      // Storage can be unavailable (private mode, quota). Non-fatal:
      // the toggles still work for this session.
    }
  }, [storageKey, hidden]);

  const isVisible = useCallback(
    (id: string) => !hidden.has(id),
    [hidden]
  );

  const toggle = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const showAll = useCallback(() => setHidden(new Set()), []);

  return { isVisible, toggle, showAll, hiddenCount: hidden.size };
}
