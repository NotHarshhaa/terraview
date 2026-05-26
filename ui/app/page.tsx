/**
 * Dashboard page — composes header, summary bar, filters and resource grid.
 */

"use client";

import * as React from "react";

import { IconFilter } from "@tabler/icons-react";

import { AuthGate } from "@/components/auth-gate";
import { ErrorsBanner } from "@/components/errors-banner";
import { FilterSidebar, type Facet } from "@/components/filter-sidebar";
import { Header } from "@/components/header";
import { ResourceGrid } from "@/components/resource-grid";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SummaryBar } from "@/components/summary-bar";
import { useSnapshot } from "@/lib/api";
import {
  type Resource,
  type Status,
  type Summary,
} from "@/lib/types";

const EMPTY_RESOURCES: Resource[] = [];

export default function DashboardPage() {
  const {
    snapshot,
    loading,
    error,
    refresh,
    refreshing,
    hasLoaded,
    unauthorized,
    signIn,
  } = useSnapshot();

  const [search, setSearch] = React.useState("");
  const [activeStatuses, setActiveStatuses] = React.useState<Set<Status>>(
    new Set(),
  );
  const [activeProviders, setActiveProviders] = React.useState<Set<string>>(
    new Set(),
  );
  const [activeCategories, setActiveCategories] = React.useState<Set<string>>(
    new Set(),
  );
  const [activeModules, setActiveModules] = React.useState<Set<string>>(
    new Set(),
  );
  const defaultFilterApplied = React.useRef(false);

  React.useEffect(() => {
    const spec = snapshot?.ui?.default_filter?.trim();
    if (!spec || defaultFilterApplied.current) return;
    const parsed = parseDefaultFilter(spec);
    if (parsed.statuses?.size) setActiveStatuses(parsed.statuses);
    if (parsed.providers?.size) setActiveProviders(parsed.providers);
    if (parsed.categories?.size) setActiveCategories(parsed.categories);
    if (parsed.modules?.size) setActiveModules(parsed.modules);
    if (parsed.search) setSearch(parsed.search);
    defaultFilterApplied.current = true;
  }, [snapshot?.ui?.default_filter]);

  const showCostColumn = snapshot?.ui?.show_cost_column ?? false;
  const pageTitle = snapshot?.ui?.title?.trim() || "Terraview";

  const resources = snapshot?.resources ?? EMPTY_RESOURCES;

  const sidebarFiltered = React.useMemo(
    () =>
      filterResources(resources, {
        search,
        statuses: new Set(),
        providers: activeProviders,
        categories: activeCategories,
        modules: activeModules,
      }),
    [resources, search, activeProviders, activeCategories, activeModules],
  );

  const filtered = React.useMemo(
    () =>
      filterResources(sidebarFiltered, {
        search: "",
        statuses: activeStatuses,
        providers: new Set(),
        categories: new Set(),
        modules: new Set(),
      }),
    [sidebarFiltered, activeStatuses],
  );

  const facetSummary = React.useMemo(
    () => summariseResources(sidebarFiltered),
    [sidebarFiltered],
  );

  const { providers, categories, modules } = React.useMemo(
    () => buildFacets(sidebarFiltered),
    [sidebarFiltered],
  );

  const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>) =>
    (value: T) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    };

  const clearFilters = React.useCallback(() => {
    setActiveStatuses(new Set());
    setActiveProviders(new Set());
    setActiveCategories(new Set());
    setActiveModules(new Set());
    setSearch("");
  }, []);

  const activeCount =
    activeStatuses.size +
    activeProviders.size +
    activeCategories.size +
    activeModules.size +
    (search.trim() ? 1 : 0);

  const filterSidebar = (
    <FilterSidebar
      search={search}
      onSearchChange={setSearch}
      providers={providers}
      activeProviders={activeProviders}
      onProviderToggle={toggle(setActiveProviders)}
      categories={categories}
      activeCategories={activeCategories}
      onCategoryToggle={toggle(setActiveCategories)}
      modules={modules}
      activeModules={activeModules}
      onModuleToggle={toggle(setActiveModules)}
      activeCount={activeCount}
      onClear={clearFilters}
    />
  );

  return (
    <div className="min-h-svh bg-background">
      <Header
        title={pageTitle}
        backendType={snapshot?.backend_type ?? ""}
        generatedAt={snapshot?.generated_at}
        refreshing={refreshing}
        onRefresh={refresh}
        mobileFilters={
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 lg:hidden">
                <IconFilter className="size-3.5" aria-hidden />
                Filters
                {activeCount > 0 ? (
                  <span className="font-mono text-xs">({activeCount})</span>
                ) : null}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              {filterSidebar}
            </SheetContent>
          </Sheet>
        }
      />

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6">
        <div className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-[60px] h-[calc(100svh-72px)]">
            {filterSidebar}
          </div>
        </div>

        <main className="min-w-0 flex-1 space-y-4">
          {unauthorized && !snapshot ? (
            <AuthGate onSignIn={signIn} error={error} />
          ) : !hasLoaded && loading ? (
            <LoadingState />
          ) : error && !snapshot ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : snapshot ? (
            <>
              {error ? <StaleDataBanner message={error} onRetry={refresh} /> : null}
              <SummaryBar
                summary={facetSummary}
                activeStatuses={activeStatuses}
                onStatusToggle={toggle(setActiveStatuses)}
              />
              <ErrorsBanner errors={snapshot.errors} />
              <ResourceGrid
                resources={filtered}
                totalBeforeFilter={sidebarFiltered.length}
                showCostColumn={showCostColumn}
              />
              <footer className="pt-2 text-center text-xs text-muted-foreground">
                <span className="font-mono">{snapshot.working_dir}</span> ·
                showing {filtered.length} of {sidebarFiltered.length} resources
                {sidebarFiltered.length !== resources.length
                  ? ` (${resources.length} total)`
                  : ""}
              </footer>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-sm">
      <h2 className="mb-1 font-medium text-destructive">
        Could not load snapshot
      </h2>
      <p className="mb-3 text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground">
        Make sure{" "}
        <code className="rounded bg-muted px-1 py-0.5">terraview serve</code> is
        running. In dev, the API defaults to{" "}
        <code className="rounded bg-muted px-1 py-0.5">localhost:7777</code> via
        Next.js rewrites.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-muted"
      >
        Try again
      </button>
    </div>
  );
}

function StaleDataBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
    >
      <span>Refresh failed — showing cached data. {message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="underline underline-offset-2 hover:no-underline"
      >
        Retry
      </button>
    </div>
  );
}

interface FilterState {
  search: string;
  statuses: Set<Status>;
  providers: Set<string>;
  categories: Set<string>;
  modules: Set<string>;
}

function filterResources(resources: Resource[], f: FilterState): Resource[] {
  const needle = f.search.trim().toLowerCase();
  return resources.filter((r) => {
    if (f.statuses.size && !f.statuses.has(r.status)) return false;
    if (f.providers.size && !f.providers.has(r.category.provider)) return false;
    if (f.categories.size && !f.categories.has(r.category.service)) return false;
    if (f.modules.size && !f.modules.has(r.module || "(root)")) return false;
    if (needle) {
      const hay =
        `${r.address} ${r.type} ${r.name} ${Object.values(r.tags ?? {}).join(" ")}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

function summariseResources(resources: Resource[]): Summary {
  const summary: Summary = {
    total: 0,
    by_status: {},
    by_provider: {},
    by_category: {},
  };
  for (const r of resources) {
    summary.total++;
    summary.by_status[r.status] = (summary.by_status[r.status] ?? 0) + 1;
    if (r.category.provider) {
      summary.by_provider[r.category.provider] =
        (summary.by_provider[r.category.provider] ?? 0) + 1;
      const cat = `${r.category.provider} › ${r.category.service}`;
      summary.by_category[cat] = (summary.by_category[cat] ?? 0) + 1;
    }
    summary.total_monthly_cost =
      (summary.total_monthly_cost ?? 0) + (r.monthly_cost ?? 0);
  }
  return summary;
}

function buildFacets(resources: Resource[]) {
  const tally = (key: (r: Resource) => string) => {
    const m = new Map<string, number>();
    for (const r of resources) {
      const k = key(r);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map<Facet>(([value, count]) => ({ value, label: value, count }));
  };

  return {
    providers: tally((r) => r.category.provider).filter((f) => f.value),
    categories: tally((r) => r.category.service).filter((f) => f.value),
    modules: tally((r) => r.module || "(root)"),
  };
}

function parseDefaultFilter(spec: string): Partial<FilterState> {
  const out: Partial<FilterState> = {
    statuses: new Set(),
    providers: new Set(),
    categories: new Set(),
    modules: new Set(),
  };

  const parts = spec.includes("&") ? spec.split("&") : [spec];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    const value = trimmed.slice(eq + 1).trim();
    if (!value) continue;

    switch (key) {
      case "status":
        value.split(",").forEach((s) => {
          const st = s.trim() as Status;
          if (st) out.statuses!.add(st);
        });
        break;
      case "provider":
        value.split(",").forEach((s) => {
          const p = s.trim();
          if (p) out.providers!.add(p);
        });
        break;
      case "category":
        value.split(",").forEach((s) => {
          const c = s.trim();
          if (c) out.categories!.add(c);
        });
        break;
      case "module":
        value.split(",").forEach((s) => {
          const m = s.trim();
          if (m) out.modules!.add(m);
        });
        break;
      case "q":
      case "search":
        out.search = value;
        break;
    }
  }

  return out;
}
