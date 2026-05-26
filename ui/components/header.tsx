/**
 * Header — sticky top bar with the Terraview wordmark, backend pill, last
 * refresh timestamp and a manual refresh button. The backend pill is also a
 * link target for screenshots in the README so the deployed environment is
 * always visible at a glance.
 */

"use client";

import * as React from "react";

import { IconRefresh, IconCloud } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  backendType: string;
  generatedAt?: string;
  refreshing: boolean;
  onRefresh: () => void;
}

export function Header({
  title,
  backendType,
  generatedAt,
  refreshing,
  onRefresh,
}: HeaderProps) {
  const relative = useRelativeTime(generatedAt);
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <svg
            viewBox="0 0 24 24"
            className="size-5 text-primary"
            aria-hidden
          >
            <path
              fill="currentColor"
              d="M12 2 2 6.5v6c0 5.25 4.25 9.5 10 9.5s10-4.25 10-9.5v-6L12 2Zm0 2.25 7.75 3.5v4.75c0 4.25-3.5 7.25-7.75 7.25s-7.75-3-7.75-7.25V7.75L12 4.25Zm0 3.25-5.25 3 5.25 3 5.25-3-5.25-3Zm-5.25 5.25v3.5l5.25 3 5.25-3v-3.5l-5.25 3-5.25-3Z"
            />
          </svg>
          <span>{title}</span>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          {backendType ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
              <IconCloud className="size-3" aria-hidden />
              {backendType}
            </span>
          ) : null}
          {relative ? (
            <span className="text-xs text-muted-foreground">
              updated {relative}
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            <IconRefresh
              className={cn("size-3.5", refreshing && "animate-spin")}
              aria-hidden
            />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <a
            href="https://github.com/NotHarshhaa/terraview"
            target="_blank"
            rel="noreferrer"
            className="hidden text-xs text-muted-foreground hover:text-foreground sm:inline"
          >
            GitHub →
          </a>
        </div>
      </div>
    </header>
  );
}

/**
 * useRelativeTime returns a short "12s ago" string and ticks once a second so
 * the timestamp stays accurate without a heavyweight date library.
 */
function useRelativeTime(iso?: string) {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!iso) return;
    const id = setInterval(force, 1000);
    return () => clearInterval(id);
  }, [iso]);
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
