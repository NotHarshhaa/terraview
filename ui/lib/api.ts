/**
 * Thin client for the Terraview HTTP API.
 *
 * Design notes:
 *  - We never throw on non-2xx. The dashboard treats backend errors as
 *    "first-class" state and renders them — silent failures hide the very
 *    bugs Terraview exists to surface.
 *  - In dev (`npm run dev`) the API runs on :7777 while Next runs on :3000,
 *    so we honour NEXT_PUBLIC_TERRAVIEW_API when present. In prod the Go
 *    binary serves both the UI and the API on the same origin.
 *  - The `useSnapshot` hook also opens a Server-Sent Events stream so the
 *    UI updates the instant the poller publishes a new snapshot — no
 *    client-side polling necessary.
 */

"use client";

import * as React from "react";

import type { Snapshot } from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_TERRAVIEW_API?.replace(/\/$/, "") ?? "";

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = body;
    try {
      msg = (JSON.parse(body) as { error?: string }).error ?? body;
    } catch {
      /* not JSON, use raw body */
    }
    throw new ApiError(res.status, msg || res.statusText);
  }
  return (await res.json()) as T;
}

export async function fetchSnapshot(): Promise<Snapshot> {
  return fetchJSON<Snapshot>("/api/snapshot");
}

export async function refreshSnapshot(): Promise<Snapshot> {
  return fetchJSON<Snapshot>("/api/refresh", { method: "POST" });
}

interface SnapshotState {
  snapshot: Snapshot | null;
  loading: boolean;
  error: string | null;
  /** Becomes true after the first successful load so the UI can show a
   *  subtle "refreshing" hint instead of the full skeleton on subsequent
   *  refreshes. */
  hasLoaded: boolean;
}

/**
 * Subscribe to live snapshot updates. The hook returns the current snapshot,
 * loading/error state and a manual `refresh` callback wired to POST
 * /api/refresh.
 *
 * The SSE subscription is best-effort: if it fails (because of a proxy that
 * buffers, an offline server, etc.) we silently fall back to a 30s polling
 * loop so the dashboard still updates eventually.
 */
export function useSnapshot() {
  const [state, setState] = React.useState<SnapshotState>({
    snapshot: null,
    loading: true,
    error: null,
    hasLoaded: false,
  });
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const snap = await fetchSnapshot();
      setState((s) => ({
        snapshot: snap,
        loading: false,
        error: null,
        hasLoaded: true,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((s) => ({
        snapshot: s.snapshot,
        loading: false,
        error: message,
        hasLoaded: s.hasLoaded,
      }));
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  React.useEffect(() => {
    // EventSource is unavailable in SSR; the "use client" directive above
    // guarantees this code only runs in the browser, but guard anyway.
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }
    const src = new EventSource(apiUrl("/api/events"));
    let pollFallback: ReturnType<typeof setInterval> | null = null;
    src.addEventListener("refreshed", () => {
      void load();
    });
    src.onerror = () => {
      // Switch to polling if SSE drops and doesn't reconnect.
      if (pollFallback) return;
      pollFallback = setInterval(() => void load(), 30_000);
    };
    return () => {
      src.close();
      if (pollFallback) clearInterval(pollFallback);
    };
  }, [load]);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const snap = await refreshSnapshot();
      setState({
        snapshot: snap,
        loading: false,
        error: null,
        hasLoaded: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, error: message }));
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { ...state, refresh, refreshing } as const;
}
