/**
 * FilterSidebar — the left rail with provider, category and module filters
 * plus the free-text search box.
 *
 * The sidebar is dumb: it receives the full list of available facets (so we
 * don't show empty checkboxes for providers that aren't in the snapshot) and
 * reports clicks back to the parent which holds the canonical filter state.
 */

"use client";

import * as React from "react";

import {
  IconSearch,
  IconFolderOpen,
  IconCubeUnfolded,
  IconCategory,
} from "@tabler/icons-react";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface Facet {
  value: string;
  label: string;
  count: number;
}

interface FilterSidebarProps {
  search: string;
  onSearchChange: (value: string) => void;

  providers: Facet[];
  activeProviders: Set<string>;
  onProviderToggle: (value: string) => void;

  categories: Facet[];
  activeCategories: Set<string>;
  onCategoryToggle: (value: string) => void;

  modules: Facet[];
  activeModules: Set<string>;
  onModuleToggle: (value: string) => void;

  onClear: () => void;
  activeCount: number;
}

export function FilterSidebar(props: FilterSidebarProps) {
  return (
    <aside className="flex h-full flex-col gap-4 p-4">
      <div className="relative">
        <IconSearch
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={props.search}
          onChange={(e) => props.onSearchChange(e.target.value)}
          placeholder="Search address, type, tag…"
          className="pl-8"
          aria-label="Search resources"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Filters
        </span>
        {props.activeCount > 0 ? (
          <button
            type="button"
            onClick={props.onClear}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear {props.activeCount}
          </button>
        ) : null}
      </div>

      <ScrollArea className="-mr-2 flex-1 pr-2">
        <FacetGroup
          icon={<IconCubeUnfolded className="size-3.5" aria-hidden />}
          label="Providers"
          facets={props.providers}
          active={props.activeProviders}
          onToggle={props.onProviderToggle}
        />
        <Separator className="my-3" />
        <FacetGroup
          icon={<IconCategory className="size-3.5" aria-hidden />}
          label="Categories"
          facets={props.categories}
          active={props.activeCategories}
          onToggle={props.onCategoryToggle}
        />
        <Separator className="my-3" />
        <FacetGroup
          icon={<IconFolderOpen className="size-3.5" aria-hidden />}
          label="Modules"
          facets={props.modules}
          active={props.activeModules}
          onToggle={props.onModuleToggle}
          emptyLabel="No modules"
        />
      </ScrollArea>
    </aside>
  );
}

interface FacetGroupProps {
  icon: React.ReactNode;
  label: string;
  facets: Facet[];
  active: Set<string>;
  onToggle: (value: string) => void;
  emptyLabel?: string;
}

function FacetGroup({
  icon,
  label,
  facets,
  active,
  onToggle,
  emptyLabel = "Nothing yet",
}: FacetGroupProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      {facets.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground/70">{emptyLabel}</p>
      ) : (
        <ul className="space-y-0.5">
          {facets.map((f) => {
            const isActive = active.has(f.value);
            return (
              <li key={f.value}>
                <button
                  type="button"
                  onClick={() => onToggle(f.value)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-sm transition",
                    "hover:bg-muted",
                    isActive && "bg-muted font-medium text-foreground"
                  )}
                  aria-pressed={isActive}
                >
                  <span className="truncate">{f.label}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {f.count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
