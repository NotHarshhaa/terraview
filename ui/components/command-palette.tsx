"use client";

import * as React from "react";

import { IconSearch } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { resourceDomId } from "@/lib/filters";
import type { Resource } from "@/lib/types";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: Resource[];
  onRefresh: () => void;
  onClearFilters: () => void;
  onViewDetails?: (resource: Resource) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  resources,
  onRefresh,
  onClearFilters,
  onViewDetails,
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState("");
  const [index, setIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const results = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return resources.slice(0, 12);
    return resources
      .filter((r) => {
        const hay = `${r.address} ${r.name} ${r.type} ${r.module}`.toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 12);
  }, [query, resources]);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  React.useEffect(() => {
    setIndex(0);
  }, [query]);

  const select = React.useCallback(
    (r: Resource) => {
      onOpenChange(false);
      if (onViewDetails) {
        onViewDetails(r);
        return;
      }
      const el = document.getElementById(resourceDomId(r.address));
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("ring-2", "ring-primary", "ring-offset-2");
      window.setTimeout(() => {
        el?.classList.remove("ring-2", "ring-primary", "ring-offset-2");
      }, 2000);
    },
    [onOpenChange, onViewDetails],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2 border-b px-3">
          <IconSearch className="size-4 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to resource by address or name…"
            className="h-11 flex-1 bg-transparent text-sm outline-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onOpenChange(false);
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter" && results[index]) {
                select(results[index]);
              }
            }}
          />
        </div>

        <ul className="max-h-72 overflow-y-auto py-1">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching resources
            </li>
          ) : (
            results.map((r, i) => (
              <li key={r.address}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted/60",
                    i === index && "bg-muted",
                  )}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => select(r)}
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {r.address}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="flex flex-wrap gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span>
            <kbd className="rounded bg-muted px-1">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="rounded bg-muted px-1">↵</kbd> jump
          </span>
          <span>
            <kbd className="rounded bg-muted px-1">esc</kbd> close
          </span>
          <button
            type="button"
            className="ml-auto underline-offset-2 hover:underline"
            onClick={() => {
              onOpenChange(false);
              onRefresh();
            }}
          >
            Refresh snapshot
          </button>
          <button
            type="button"
            className="underline-offset-2 hover:underline"
            onClick={() => {
              onOpenChange(false);
              onClearFilters();
            }}
          >
            Clear filters
          </button>
        </div>
      </div>
    </div>
  );
}
