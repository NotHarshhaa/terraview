/**
 * Turns API / network failures into a clear cause + fix for the UI.
 */

import { ApiError } from "./api";

const API_TARGET =
  process.env.NEXT_PUBLIC_TERRAVIEW_API?.replace(/\/$/, "") ||
  "http://localhost:7777";

export interface SnapshotLoadError {
  title: string;
  cause: string;
  fix?: string[];
}

function isBackendUnreachable(message: string, status?: number): boolean {
  const lower = message.toLowerCase();
  if (status === 502 || status === 504) return true;
  if (status === 500 && lower === "internal server error") return true;
  return (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("econnrefused") ||
    lower.includes("fetch failed") ||
    lower.includes("connection refused")
  );
}

export function describeSnapshotLoadError(
  err: unknown,
): SnapshotLoadError {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return {
        title: "Authentication required",
        cause: err.message || "Sign in to load the snapshot.",
      };
    }

    if (isBackendUnreachable(err.message, err.status)) {
      return backendUnreachableError(err.message);
    }

    return {
      title: "Could not load snapshot",
      cause: err.message || `API returned ${err.status}.`,
    };
  }

  const message = err instanceof Error ? err.message : String(err);

  if (isBackendUnreachable(message)) {
    return backendUnreachableError(message);
  }

  return {
    title: "Could not load snapshot",
    cause: message || "An unexpected error occurred.",
  };
}

function backendUnreachableError(detail?: string): SnapshotLoadError {
  const cause =
    detail && !/^internal server error$/i.test(detail.trim())
      ? `The Terraview API at ${API_TARGET} is not reachable (${detail}).`
      : `The Terraview API at ${API_TARGET} is not running or not reachable.`;

  return {
    title: "Terraview API is not running",
    cause,
    fix: [
      "go run ./cmd/terraview serve ./testdata/sample-project --no-ui",
      "cd ui && npm run dev",
    ],
  };
}
