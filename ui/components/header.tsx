/**
 * Header — sticky top bar with wordmark, backend pill, refresh and theme toggle.
 */

"use client";

import * as React from "react";

import {
  IconRefresh,
  IconCloud,
  IconSearch,
  IconLogout,
  IconKeyboard,
} from "@tabler/icons-react";

import { ConnectionBadge } from "@/components/connection-badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/lib/api";

interface HeaderProps {
  title: string;
  backendType: string;
  generatedAt?: string;
  connectionState: ConnectionState;
  refreshing: boolean;
  onRefresh: () => void;
  version?: string | null;
  onOpenCommand?: () => void;
  onShowShortcuts?: () => void;
  authRequired?: boolean;
  onSignOut?: () => void;
  exportMenu?: React.ReactNode;
  mobileFilters?: React.ReactNode;
}

export function Header({
  title,
  backendType,
  generatedAt,
  connectionState,
  refreshing,
  onRefresh,
  version,
  onOpenCommand,
  onShowShortcuts,
  authRequired,
  onSignOut,
  exportMenu,
  mobileFilters,
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
          <ConnectionBadge state={connectionState} />
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
          {version ? (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              v{version}
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {mobileFilters}
          <Button
            variant="outline"
            size="sm"
            className="hidden gap-1.5 sm:inline-flex"
            onClick={onOpenCommand}
          >
            <IconSearch className="size-3.5" aria-hidden />
            Search
            <kbd className="hidden rounded bg-muted px-1 font-mono text-[10px] md:inline">
              ⌘K
            </kbd>
          </Button>
          {exportMenu}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onShowShortcuts}
            aria-label="Keyboard shortcuts"
            className="hidden sm:inline-flex"
          >
            <IconKeyboard className="size-4" aria-hidden />
          </Button>
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="gap-1.5"
            title="Refresh (r)"
          >
            <IconRefresh
              className={cn("size-3.5", refreshing && "animate-spin")}
              aria-hidden
            />
            <span className="hidden sm:inline">
              {refreshing ? "Refreshing…" : "Refresh"}
            </span>
          </Button>
          {authRequired && onSignOut ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onSignOut}
              aria-label="Sign out"
              title="Sign out"
            >
              <IconLogout className="size-4" aria-hidden />
            </Button>
          ) : null}
          <a
            href="https://github.com/NotHarshhaa/terraview"
            target="_blank"
            rel="noreferrer"
            className="hidden text-xs text-muted-foreground hover:text-foreground lg:inline"
          >
            GitHub →
          </a>
        </div>
      </div>
    </header>
  );
}

function useRelativeTime(iso?: string) {
  const [mounted, setMounted] = React.useState(false);
  const [relative, setRelative] = React.useState<string | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted || !iso) {
      setRelative(null);
      return;
    }
    const update = () => {
      const t = new Date(iso).getTime();
      if (Number.isNaN(t)) {
        setRelative(null);
        return;
      }
      const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
      if (seconds < 5) setRelative("just now");
      else if (seconds < 60) setRelative(`${seconds}s ago`);
      else if (seconds < 3600) setRelative(`${Math.floor(seconds / 60)}m ago`);
      else if (seconds < 86400) setRelative(`${Math.floor(seconds / 3600)}h ago`);
      else setRelative(`${Math.floor(seconds / 86400)}d ago`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [mounted, iso]);

  return relative;
}
