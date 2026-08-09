import { useQueryClient } from "@tanstack/react-query";
import { useParams as useRouterParams } from "@tanstack/react-router";

export function useSeed<T>(key: unknown[]): T | undefined {
  return useQueryClient().getQueryData<{ data: T }>(key)?.data;
}

// Matched route params ([seg] segments). Pages get them as a `params` prop;
// deep components can call this. Backed by the app shell's TanStack Router so
// the values stay LIVE across soft navigation — the server's __nx_params__
// tag is only the boot-time snapshot and goes stale after a client-side nav.
export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useRouterParams({ strict: false }) as T;
}

// Everything orval generates — React Query hooks for components, plus plain
// typed clients (getX/updateX functions and URL builders) for event handlers,
// scripts, and tests. The framework regenerates ./generated/index.ts on every
// build, so new endpoints show up here without editing this file.
export * from "./generated";

// --- formatting (ported from the Rust `ui.rs` helpers) ---------------------------------------

/**
 * Thousands-separated integer.
 *
 * The `n === 0` guard also catches negative zero, which Intl renders as "-0". That is not
 * hypothetical: Rust's `Sum for f64` uses -0.0 as its identity (so signed zeros survive addition),
 * so any empty `.sum()` — an org with no standings yet — serializes as `-0.0`.
 */
export function fmtInt(n: number): string {
  if (n === 0) return "0";
  return Math.round(n).toLocaleString("en-US");
}

/** Score-style number: one decimal place, dropped when the value is whole. */
export function fmtNum(n: number): string {
  if (n === 0) return "0";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString("en-US")
    : rounded.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * A scoring *rate* (points per reaction, per impression, ...). Distinct from fmtNum because rates
 * are routinely far below 0.1 — `perImpression` defaults to 0.01, which fmtNum would round to "0"
 * and tell participants impressions are worth nothing.
 */
export function fmtRate(n: number): string {
  if (n === 0) return "0";
  const decimals = Math.abs(n) < 0.01 ? 4 : Math.abs(n) < 1 ? 3 : 2;
  return n
    .toFixed(decimals)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

/** Unix seconds → `Mar 4, 2026`. Dates are stored as unix seconds throughout. */
export function fmtDate(unix: number): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Initials for the avatar placeholder, until profile pictures are stored. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
