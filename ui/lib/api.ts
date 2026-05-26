/**
 * Thin client for the Terraview HTTP API.
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
  const headers: Record<string, string> = {};
  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = body;
    try {
      msg = (JSON.parse(body) as { error?: string }).error ?? body;
    } catch {
      /* not JSON */
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
  hasLoaded: boolean;
}

export function useSnapshot() {
  const [state, setState] = React.useState<SnapshotState>({
    snapshot: null,
    loading: true,
    error: null,
    hasLoaded: false,
  });
  const [refreshing, setRefreshing] = React.useState(false);
  const loadGen = React.useRef(0);

  const load = React.useCallback(async () => {
    const gen = ++loadGen.current;
    try {
      const snap = await fetchSnapshot();
      if (gen !== loadGen.current) return;
      setState({
        snapshot: snap,
        loading: false,
        error: null,
        hasLoaded: true,
      });
    } catch (err) {
      if (gen !== loadGen.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        snapshot: prev.snapshot,
        loading: false,
        error: message,
        hasLoaded: prev.hasLoaded,
      }));
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }
    const src = new EventSource(apiUrl("/api/events"));
    let pollFallback: ReturnType<typeof setInterval> | null = null;
    let consecutiveErrors = 0;

    const stopPolling = () => {
      if (pollFallback) {
        clearInterval(pollFallback);
        pollFallback = null;
      }
      consecutiveErrors = 0;
    };

    src.addEventListener("refreshed", () => {
      void load();
    });
    src.onopen = () => {
      stopPolling();
    };
    src.onerror = () => {
      consecutiveErrors++;
      if (consecutiveErrors >= 3 && !pollFallback) {
        pollFallback = setInterval(() => void load(), 30_000);
      }
    };

    return () => {
      src.close();
      stopPolling();
    };
  }, [load]);

  const refresh = React.useCallback(async () => {
    const gen = ++loadGen.current;
    setRefreshing(true);
    try {
      const snap = await refreshSnapshot();
      if (gen !== loadGen.current) return;
      setState({
        snapshot: snap,
        loading: false,
        error: null,
        hasLoaded: true,
      });
    } catch (err) {
      if (gen !== loadGen.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, error: message }));
    } finally {
      if (gen === loadGen.current) {
        setRefreshing(false);
      }
    }
  }, []);

  return { ...state, refresh, refreshing } as const;
}
