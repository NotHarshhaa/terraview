/**
 * Dashboard page — composes the header, summary bar, filter sidebar and
 * resource grid into the canonical "Provider › Service" view shown in the
 * README.
 *
 * Filter state lives here. Everything below this component is presentation —
 * pass props down, fire callbacks up.
 */

"use client";

import * as React from "react";

import { ErrorsBanner } from "@/components/errors-banner";
import { FilterSidebar, type Facet } from "@/components/filter-sidebar";
import { Header } from "@/components/header";
import { ResourceGrid } from "@/components/resource-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { SummaryBar } from "@/components/summary-bar";
import { useSnapshot } from "@/lib/api";
import {
  STATUS_META,
  type Resource,
  type Status,
} from "@/lib/types";

export default function DashboardPage() {
  const { snapshot, loading, error, refresh, refreshing, hasLoaded } =
    useSnapshot();

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

  const resources = snapshot?.resources ?? [];

  const { providers, categories, modules } = React.useMemo(
    () => buildFacets(resources),
    [resources],
  );

  const filtered = React.useMemo(
    () =>
      filterResources(resources, {
        search,
        statuses: activeStatuses,
        providers: activeProviders,
        categories: activeCategories,
        modules: activeModules,
      }),
    [
      resources,
      search,
      activeStatuses,
      activeProviders,
      activeCategories,
      activeModules,
    ],
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

  const activeCount =
    activeStatuses.size +
    activeProviders.size +
    activeCategories.size +
    activeModules.size;

  return (
    <div className="min-h-svh bg-background">
      <Header
        title="Terraview"
        backendType={snapshot?.backend_type ?? ""}
        generatedAt={snapshot?.generated_at}
        refreshing={refreshing}
        onRefresh={refresh}
      />

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6">
        <div className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-[60px] h-[calc(100svh-72px)] rounded-lg border bg-card/30">
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
              onClear={() => {
                setActiveStatuses(new Set());
                setActiveProviders(new Set());
                setActiveCategories(new Set());
                setActiveModules(new Set());
                setSearch("");
              }}
            />
          </div>
        </div>

        <main className="min-w-0 flex-1 space-y-4">
          {!hasLoaded && loading ? (
            <LoadingState />
          ) : error && !snapshot ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : snapshot ? (
            <>
              <SummaryBar
                summary={snapshot.summary}
                activeStatuses={activeStatuses}
                onStatusToggle={toggle(setActiveStatuses)}
              />
              <ErrorsBanner errors={snapshot.errors} />
              <ResourceGrid
                resources={filtered}
                totalBeforeFilter={resources.length}
              />
              <footer className="pt-2 text-center text-xs text-muted-foreground">
                <span className="font-mono">{snapshot.working_dir}</span>{" "}
                · serving {filtered.length} of {resources.length} resources
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

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-sm">
      <h2 className="mb-1 font-medium text-destructive">
        Could not load snapshot
      </h2>
      <p className="mb-3 text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground">
        Make sure <code className="rounded bg-muted px-1 py-0.5">terraview serve</code> is running and reachable at{" "}
        <code className="rounded bg-muted px-1 py-0.5">{process.env.NEXT_PUBLIC_TERRAVIEW_API ?? "the same origin"}</code>.
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
      const hay = `${r.address} ${r.type} ${r.name} ${Object.values(r.tags ?? {}).join(" ")}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
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

  const providers = tally((r) => r.category.provider).filter((f) => f.value);
  const categories = tally((r) => r.category.service).filter((f) => f.value);
  const modules = tally((r) => r.module || "(root)");

  // Bonus: surface unique status labels just in case (not used directly but
  // ensures the export stays exhaustive for future filter UIs).
  void STATUS_META;

  return { providers, categories, modules };
}
