/**
 * Header — sticky top bar with brand, status meta, and primary actions.
 */

"use client";

import * as React from "react";

import {
  IconBrandGithub,
  IconKeyboard,
  IconLogout,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";

import { ConnectionBadge } from "@/components/connection-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ConnectionState } from "@/lib/api";
import { CloudServiceIcon } from "@/lib/cloud-icons";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  backendType: string;
  generatedAt?: string;
  connectionState: ConnectionState;
  refreshing: boolean;
  onRefresh: () => void;
  version?: string | null;
  headline?: string | null;
  resourceCount?: number;
  totalResources?: number;
  onOpenCommand?: () => void;
  onShowShortcuts?: () => void;
  authRequired?: boolean;
  onSignOut?: () => void;
  exportMenu?: React.ReactNode;
  mobileFilters?: React.ReactNode;
  workspaceSwitcher?: React.ReactNode;
}

export function Header({
  title,
  backendType,
  generatedAt,
  connectionState,
  refreshing,
  onRefresh,
  version,
  headline,
  resourceCount,
  totalResources,
  onOpenCommand,
  onShowShortcuts,
  authRequired,
  onSignOut,
  exportMenu,
  mobileFilters,
  workspaceSwitcher,
}: HeaderProps) {
  const relative = useRelativeTime(generatedAt);
  const backendProvider = backendProviderLabel(backendType);

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto w-full max-w-screen-2xl px-6 lg:px-8">
        <div className="flex min-h-16 items-center gap-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <TerraviewMark />
            <div className="min-w-0">
              <p className="truncate font-heading text-sm font-semibold tracking-wider uppercase lg:text-base">
                {title}
              </p>
              {relative ? (
                <p className="truncate text-[11px] text-muted-foreground lg:hidden">
                  updated {relative}
                </p>
              ) : null}
            </div>
          </div>

          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            {workspaceSwitcher}
            {mobileFilters}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden gap-1.5 sm:inline-flex"
                  onClick={onOpenCommand}
                >
                  <IconSearch className="size-3.5" aria-hidden />
                  <span className="hidden md:inline">Search</span>
                  <kbd className="hidden rounded-sm border bg-muted px-1 font-mono text-[10px] lg:inline">
                    ⌘K
                  </kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Command palette (⌘K)</TooltipContent>
            </Tooltip>

            {exportMenu}

            <div className="hidden items-center gap-1 sm:flex">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onShowShortcuts}
                    aria-label="Keyboard shortcuts"
                  >
                    <IconKeyboard className="size-4" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Shortcuts (?)</TooltipContent>
              </Tooltip>

              <ThemeToggle />

              {authRequired && onSignOut ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={onSignOut}
                      aria-label="Sign out"
                    >
                      <IconLogout className="size-4" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sign out</TooltipContent>
                </Tooltip>
              ) : null}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a
                      href="https://github.com/NotHarshhaa/terraview"
                      target="_blank"
                      rel="noreferrer"
                      aria-label="GitHub repository"
                    >
                      <IconBrandGithub className="size-4" aria-hidden />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>GitHub</TooltipContent>
              </Tooltip>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="sm:hidden"
                  aria-label="More actions"
                >
                  <span className="font-mono text-xs">···</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onShowShortcuts}>
                  Keyboard shortcuts
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenCommand}>
                  Search resources
                </DropdownMenuItem>
                {authRequired && onSignOut ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onSignOut}>
                      Sign out
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a
                    href="https://github.com/NotHarshhaa/terraview"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  onClick={onRefresh}
                  disabled={refreshing}
                  aria-busy={refreshing}
                  data-refreshing={refreshing ? "true" : "false"}
                  className={cn(
                    "terraview-refresh-btn gap-1.5 transition-shadow",
                    refreshing && "disabled:opacity-100",
                  )}
                >
                  <IconRefresh
                    className={cn(
                      "terraview-refresh-icon size-3.5",
                      refreshing && "motion-reduce:animate-none",
                    )}
                    data-refreshing={refreshing ? "true" : "false"}
                    aria-hidden
                  />
                  <span className="hidden sm:inline">
                    {refreshing ? "Refreshing…" : "Refresh"}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {refreshing ? "Refreshing snapshot…" : "Refresh snapshot (r)"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <HeaderMeta
          className="flex flex-wrap items-center gap-2.5 border-t border-border/40 pb-4 pt-3 lg:gap-3"
          backendType={backendType}
          backendProvider={backendProvider}
          connectionState={connectionState}
          headline={headline}
          relative={relative}
          generatedAt={generatedAt}
          version={version}
          resourceCount={resourceCount}
          totalResources={totalResources}
          compact={false}
        />
      </div>
    </header>
  );
}

function TerraviewMark() {
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path
          fill="currentColor"
          d="M12 2 2 6.5v6c0 5.25 4.25 9.5 10 9.5s10-4.25 10-9.5v-6L12 2Zm0 2.25 7.75 3.5v4.75c0 4.25-3.5 7.25-7.75 7.25s-7.75-3-7.75-7.25V7.75L12 4.25Zm0 3.25-5.25 3 5.25 3 5.25-3-5.25-3Zm-5.25 5.25v3.5l5.25 3 5.25-3v-3.5l-5.25 3-5.25-3Z"
        />
      </svg>
    </div>
  );
}

function HeaderMeta({
  backendType,
  backendProvider,
  connectionState,
  headline,
  relative,
  generatedAt,
  version,
  resourceCount,
  totalResources,
  className,
  compact = false,
}: {
  backendType: string;
  backendProvider: string | null;
  connectionState: ConnectionState;
  headline?: string | null;
  relative: string | null;
  generatedAt?: string;
  version?: string | null;
  resourceCount?: number;
  totalResources?: number;
  className?: string;
  compact?: boolean;
}) {
  const showResources =
    resourceCount !== undefined && totalResources !== undefined;

  return (
    <div className={cn("items-center gap-2.5 lg:gap-3", className)}>
      <ConnectionBadge state={connectionState} lastRefreshedAt={generatedAt} />

      {backendType ? (
        <Badge variant="secondary" className="gap-1.5 normal-case">
          {backendProvider ? (
            <CloudServiceIcon
              provider={backendProvider}
              className="size-3.5"
            />
          ) : null}
          {backendType}
        </Badge>
      ) : null}

      {showResources ? (
        <Badge variant="outline" className="normal-case tabular-nums">
          {resourceCount} / {totalResources}
        </Badge>
      ) : null}

      {!compact && relative ? (
        <span className="text-xs text-muted-foreground">updated {relative}</span>
      ) : null}

      {headline ? (
        <span
          className={cn(
            "text-xs text-muted-foreground lg:text-sm",
            compact
              ? "max-w-full basis-full truncate"
              : "min-w-0 flex-1 truncate lg:max-w-none lg:basis-auto",
          )}
          title={headline}
        >
          {headline}
        </span>
      ) : null}

      {version ? (
        <Badge variant="ghost" className="font-mono normal-case">
          v{version}
        </Badge>
      ) : null}
    </div>
  );
}

function backendProviderLabel(backendType: string): string | null {
  switch (backendType.toLowerCase()) {
    case "s3":
      return "AWS";
    case "gcs":
      return "GCP";
    case "azureblob":
    case "azurerm":
      return "Azure";
    case "tfc":
    case "remote":
      return "AWS";
    default:
      return null;
  }
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
