import { supabase } from "./supabase";

/**
 * Lightweight error visibility.
 *
 * Keeps a rolling trail of what the user did most recently ("breadcrumbs" in
 * the Sentry sense) so that when something breaks you can see the steps that
 * led there, rather than a bare stack trace with no context.
 *
 * PRIVACY: breadcrumbs record *what kind* of thing happened, never the
 * content. Route names and action labels only — no form values, no contact
 * details, no resume text. Anything added here ends up in the database, so
 * keep it that way.
 */

export type BreadcrumbCategory = "navigation" | "action" | "network" | "error";

export interface Breadcrumb {
  at: string;
  category: BreadcrumbCategory;
  message: string;
  /** Small, non-identifying extras — counts, status codes, feature flags. */
  data?: Record<string, string | number | boolean | null>;
}

const MAX_BREADCRUMBS = 25;
const trail: Breadcrumb[] = [];

export function addBreadcrumb(
  category: BreadcrumbCategory,
  message: string,
  data?: Breadcrumb["data"],
) {
  trail.push({ at: new Date().toISOString(), category, message, data });
  // Ring buffer: only the most recent steps matter for diagnosing a failure.
  if (trail.length > MAX_BREADCRUMBS) trail.shift();
}

export function getBreadcrumbs(): Breadcrumb[] {
  return [...trail];
}

export function clearBreadcrumbs() {
  trail.length = 0;
}

interface LogErrorOptions {
  /** Where it happened, e.g. "Calendar.createEvent". */
  context?: string;
  /** True when a React error boundary caught it. */
  fatal?: boolean;
  componentStack?: string;
}

/** Reported errors are deduped so a render loop can't spam the table. */
const recentlyLogged = new Set<string>();

export async function logError(
  error: unknown,
  options: LogErrorOptions = {},
): Promise<void> {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const stack = error instanceof Error ? error.stack : undefined;

  const fingerprint = `${options.context ?? ""}:${message}`;
  if (recentlyLogged.has(fingerprint)) return;
  recentlyLogged.add(fingerprint);
  setTimeout(() => recentlyLogged.delete(fingerprint), 30_000);

  const breadcrumbs = getBreadcrumbs();

  // Always surface locally — during development this is the fastest signal.
  console.error(`[offrplus] ${options.context ?? "error"}:`, error, {
    breadcrumbs,
  });

  addBreadcrumb("error", message, { context: options.context ?? null });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Anonymous visitors can't write to the table (RLS), so don't try.
    if (!user) return;

    await supabase.from("error_logs").insert({
      user_id: user.id,
      message: message.slice(0, 2000),
      context: options.context ?? null,
      stack: stack?.slice(0, 6000) ?? null,
      component_stack: options.componentStack?.slice(0, 6000) ?? null,
      breadcrumbs,
      fatal: options.fatal ?? false,
      url: window.location.pathname,
      user_agent: navigator.userAgent.slice(0, 500),
    });
  } catch {
    // Never let error reporting throw — that turns one bug into two.
  }
}

/**
 * Catches the two classes of failure React can't: errors thrown outside the
 * render tree, and promises rejected with no handler.
 */
export function installGlobalErrorHandlers() {
  window.addEventListener("error", (event) => {
    logError(event.error ?? event.message, { context: "window.onerror" });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logError(event.reason, { context: "unhandledrejection" });
  });
}
