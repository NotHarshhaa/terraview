/**
 * Thin client for the Terraview HTTP API.
 */

"use client";

import * as React from "react";

import type { Snapshot } from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_TERRAVIEW_API?.replace(/\/$/, "") ?? "";

const AUTH_STORAGE_KEY = "terraview_auth";

interface StoredAuth {
  username?: string;
  password?: string;
  accessToken?: string;
}

function apiUrl(path: string, query?: string): string {
  const base = `${API_BASE}${path}`;
  if (!query) return base;
  return `${base}${base.includes("?") ? "&" : "?"}${query}`;
}

export function getStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export function setStoredAuth(auth: StoredAuth | null) {
  if (typeof window === "undefined") return;
  if (!auth || (!auth.accessToken && !auth.username)) {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

function authHeaders(): Record<string, string> {
  const auth = getStoredAuth();
  if (!auth) return {};
  if (auth.accessToken) {
    return { Authorization: `Bearer ${auth.accessToken}` };
  }
  if (auth.username && auth.password) {
    return { Authorization: `Basic ${btoa(`${auth.username}:${auth.password}`)}` };
  }
  return {};
}

function authQuery(): string {
  const auth = getStoredAuth();
  if (auth?.accessToken) {
    return `access_token=${encodeURIComponent(auth.accessToken)}`;
  }
  return "";
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders() };
  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
    // Same-origin (Next.js rewrites): send session cookies. Cross-origin dev
    // calls use Bearer/query tokens instead — omit avoids CORS credential blocks.
    credentials: API_BASE ? "omit" : "include",
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

export async function fetchHealth(): Promise<{ version?: string; status?: string }> {
  return fetchJSON("/api/health");
}

export async function refreshSnapshot(): Promise<Snapshot> {
  return fetchJSON<Snapshot>("/api/refresh", { method: "POST" });
}

export async function login(
  username: string,
  password: string,
): Promise<{ access_token?: string }> {
  return fetchJSON("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export type ConnectionState = "connecting" | "live" | "polling" | "offline";

interface SnapshotState {
  snapshot: Snapshot | null;
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  authRequired: boolean;
  unauthorized: boolean;
  connectionState: ConnectionState;
}

export function useSnapshot() {
  const [state, setState] = React.useState<SnapshotState>({
    snapshot: null,
    loading: true,
    error: null,
    hasLoaded: false,
    authRequired: false,
    unauthorized: false,
    connectionState: "connecting",
  });
  const [refreshing, setRefreshing] = React.useState(false);
  const [version, setVersion] = React.useState<string | null>(null);
  const loadGen = React.useRef(0);

  React.useEffect(() => {
    void fetchHealth()
      .then((h) => setVersion(h.version ?? null))
      .catch(() => setVersion(null));
  }, []);

  const load = React.useCallback(async () => {
    const gen = ++loadGen.current;
    try {
      const snap = await fetchSnapshot();
      if (gen !== loadGen.current) return;
      setState((prev) => ({
        snapshot: snap,
        loading: false,
        error: null,
        hasLoaded: true,
        authRequired: snap.ui?.auth_required ?? false,
        unauthorized: false,
        connectionState: prev.connectionState,
      }));
    } catch (err) {
      if (gen !== loadGen.current) return;
      const message = err instanceof Error ? err.message : String(err);
      const unauthorized = err instanceof ApiError && err.status === 401;
      setState((prev) => ({
        snapshot: prev.snapshot,
        loading: false,
        error: message,
        hasLoaded: prev.hasLoaded,
        authRequired: unauthorized || prev.authRequired,
        unauthorized,
        connectionState: prev.snapshot ? prev.connectionState : "offline",
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
    const query = authQuery();
    const src = new EventSource(apiUrl("/api/events", query || undefined));
    let pollFallback: ReturnType<typeof setInterval> | null = null;
    let consecutiveErrors = 0;

    const stopPolling = () => {
      if (pollFallback) {
        clearInterval(pollFallback);
        pollFallback = null;
      }
      consecutiveErrors = 0;
    };

    setState((prev) => ({ ...prev, connectionState: "connecting" }));

    src.addEventListener("refreshed", () => {
      void load();
    });
    src.onopen = () => {
      stopPolling();
      setState((prev) => ({ ...prev, connectionState: "live" }));
    };
    src.onerror = () => {
      consecutiveErrors++;
      if (consecutiveErrors >= 3 && !pollFallback) {
        pollFallback = setInterval(() => void load(), 30_000);
        setState((prev) => ({ ...prev, connectionState: "polling" }));
      } else if (consecutiveErrors === 1) {
        setState((prev) =>
          prev.connectionState === "live" ? { ...prev, connectionState: "connecting" } : prev,
        );
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
      setState((prev) => ({
        snapshot: snap,
        loading: false,
        error: null,
        hasLoaded: true,
        authRequired: snap.ui?.auth_required ?? false,
        unauthorized: false,
        connectionState: prev.connectionState,
      }));
    } catch (err) {
      if (gen !== loadGen.current) return;
      const message = err instanceof Error ? err.message : String(err);
      const unauthorized = err instanceof ApiError && err.status === 401;
      setState((prev) => ({
        ...prev,
        error: message,
        unauthorized,
        authRequired: unauthorized || prev.authRequired,
      }));
    } finally {
      if (gen === loadGen.current) {
        setRefreshing(false);
      }
    }
  }, []);

  const signIn = React.useCallback(
    async (username: string, password: string) => {
      const result = await login(username, password);
      setStoredAuth({
        username,
        password,
        accessToken: result.access_token,
      });
      await load();
    },
    [load],
  );

  const signOut = React.useCallback(() => {
    setStoredAuth(null);
    setState({
      snapshot: null,
      loading: true,
      error: null,
      hasLoaded: false,
      authRequired: true,
      unauthorized: true,
      connectionState: "connecting",
    });
    void load();
  }, [load]);

  return { ...state, refresh, refreshing, signIn, signOut, reload: load, version } as const;
}
