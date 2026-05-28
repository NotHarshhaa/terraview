/**
 * Dashboard — main Terraview UI with filters, live updates and power-user tools.
 */

"use client";

import * as React from "react";

import { useRouter, useSearchParams } from "next/navigation";
import { IconFilter } from "@tabler/icons-react";

import { AuthGate } from "@/components/auth-gate";
import { CommandPalette } from "@/components/command-palette";
import { CopyText } from "@/components/copy-button";
import { ErrorsBanner } from "@/components/errors-banner";
import { DriftAlertsBanner } from "@/components/drift-alerts-banner";
import { DependencyGraphView } from "@/components/dependency-graph";
import { ExportMenu } from "@/components/export-menu";
import { buildFilterChips, FilterChips } from "@/components/filter-chips";
import { FilterSidebar } from "@/components/filter-sidebar";
import { Header } from "@/components/header";
import { AttentionBanner, StatusChart } from "@/components/insights-panel";
import { ProviderBreakdown } from "@/components/provider-breakdown";
import { ResourceDetailSheet } from "@/components/resource-detail-sheet";
import { ResourceGrid } from "@/components/resource-grid";
import { StateInfoBar } from "@/components/state-info-bar";
import { useDashboardHotkeys } from "@/components/shortcuts-sheet";
import { useToast } from "@/components/toast-provider";
import { ViewToolbar } from "@/components/view-toolbar";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
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
  buildFacets,
  detectTagGroupKeys,
  emptyFilters,
  filterActiveCount,
  filterResources,
  filtersFromSearchParams,
  filtersToSearchParams,
  groupByFromParams,
  mergeFilters,
  parseFilterSpec,
  resourceDomId,
  summariseResources,
  tagGroupKeyFromParams,
  type FilterState,
  type GroupByMode,
} from "@/lib/filters";
import {
  deleteView,
  loadSavedViews,
  saveView,
  type SavedView,
} from "@/lib/saved-views";
import type { Resource, Status } from "@/lib/types";
import {
  QUICK_PRESETS,
  sortResources,
  type Density,
  type SortDir,
  type SortKey,
} from "@/lib/views";

const EMPTY_RESOURCES: Resource[] = [];
const GROUP_BY_KEY = "terraview_group_by";
const TAG_GROUP_KEY = "terraview_tag_group_key";
const DENSITY_KEY = "terraview_density";
const SORT_KEY = "terraview_sort_key";
const SORT_DIR_KEY = "terraview_sort_dir";
const VIEW_MODE_KEY = "terraview_view_mode";

export function Dashboard() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    snapshot,
    loading,
    error,
    refresh,
    refreshing,
    hasLoaded,
    unauthorized,
    authRequired,
    connectionState,
    signIn,
    signOut,
    version,
    headline,
    switchWorkspace,
    switchingWorkspace,
  } = useSnapshot();

  const [filters, setFilters] = React.useState<FilterState>(() => {
    const f = filtersFromSearchParams(searchParams);
    return { ...f, statuses: new Set() };
  });
  const [activeStatuses, setActiveStatuses] = React.useState<Set<Status>>(() => {
    const f = filtersFromSearchParams(searchParams);
    return new Set(f.statuses);
  });
  const [groupBy, setGroupBy] = React.useState<GroupByMode>(() =>
    groupByFromParams(searchParams),
  );
  const [tagGroupKey, setTagGroupKey] = React.useState(() =>
    tagGroupKeyFromParams(searchParams),
  );
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [density, setDensity] = React.useState<Density>("comfortable");
  const [viewMode, setViewMode] = React.useState<"grid" | "graph">("grid");
  const graphRefreshed = React.useRef(false);
  const [savedViews, setSavedViews] = React.useState<SavedView[]>([]);
  const [detailResource, setDetailResource] = React.useState<Resource | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [gridSignal, setGridSignal] = React.useState<{
    action: "expand" | "collapse";
    seq: number;
  } | null>(null);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const defaultFilterApplied = React.useRef(false);
  const urlHydrated = React.useRef(false);

  const {
    search,
    providers: activeProviders,
    categories: activeCategories,
    modules: activeModules,
    tags: activeTags,
  } = filters;

  React.useEffect(() => {
    setSavedViews(loadSavedViews());
    const storedDensity = localStorage.getItem(DENSITY_KEY);
    if (storedDensity === "compact" || storedDensity === "comfortable") {
      setDensity(storedDensity);
    }
    const sk = localStorage.getItem(SORT_KEY);
    if (sk === "name" || sk === "status" || sk === "type" || sk === "address") {
      setSortKey(sk);
    }
    const sd = localStorage.getItem(SORT_DIR_KEY);
    if (sd === "asc" || sd === "desc") setSortDir(sd);
    const vm = localStorage.getItem(VIEW_MODE_KEY);
    if (vm === "grid" || vm === "graph") setViewMode(vm);
  }, []);

  React.useEffect(() => {
    if (urlHydrated.current) return;
    const fromUrl = filtersFromSearchParams(searchParams);
    const hasUrlFilters =
      filterActiveCount(fromUrl) > 0 || searchParams.get("group");
    if (hasUrlFilters) {
      setFilters({ ...fromUrl, statuses: new Set() });
      setActiveStatuses(new Set(fromUrl.statuses));
      setGroupBy(groupByFromParams(searchParams));
      const urlTagKey = tagGroupKeyFromParams(searchParams);
      if (urlTagKey) setTagGroupKey(urlTagKey);
      urlHydrated.current = true;
      defaultFilterApplied.current = true;
      return;
    }
    urlHydrated.current = true;
  }, [searchParams]);

  React.useEffect(() => {
    const spec = snapshot?.ui?.default_filter?.trim();
    if (!spec || defaultFilterApplied.current) return;
    const parsed = parseFilterSpec(spec);
    setFilters((prev) =>
      mergeFilters(prev, {
        search: parsed.search,
        providers: parsed.providers,
        categories: parsed.categories,
        modules: parsed.modules,
        tags: parsed.tags,
      }),
    );
    if (parsed.statuses?.size) setActiveStatuses(parsed.statuses);
    defaultFilterApplied.current = true;
  }, [snapshot?.ui?.default_filter]);

  React.useEffect(() => {
    if (searchParams.get("group")) return;
    const stored = localStorage.getItem(GROUP_BY_KEY);
    if (stored === "module" || stored === "category" || stored === "tag") {
      setGroupBy(stored);
    }
  }, [searchParams]);

  React.useEffect(() => {
    if (!urlHydrated.current) return;
    const params = filtersToSearchParams(filters, groupBy, tagGroupKey);
    if (activeStatuses.size) {
      params.set("status", [...activeStatuses].join(","));
    }
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }, [filters, groupBy, tagGroupKey, activeStatuses, router]);

  React.useEffect(() => {
    if (viewMode !== "graph" || graphRefreshed.current) return;
    graphRefreshed.current = true;
    void refresh();
  }, [viewMode, refresh]);

  const showCostColumn = snapshot?.ui?.show_cost_column ?? false;
  const pageTitle = snapshot?.ui?.title?.trim() || "Terraview";
  const resources = snapshot?.resources ?? EMPTY_RESOURCES;
  const tagGroupKeys = React.useMemo(
    () => detectTagGroupKeys(resources),
    [resources],
  );

  React.useEffect(() => {
    if (groupBy !== "tag") return;
    const fromUrl = tagGroupKeyFromParams(searchParams);
    if (fromUrl && tagGroupKeys.includes(fromUrl)) {
      setTagGroupKey(fromUrl);
      return;
    }
    if (tagGroupKey && tagGroupKeys.includes(tagGroupKey)) return;
    const stored = localStorage.getItem(TAG_GROUP_KEY);
    if (stored && tagGroupKeys.includes(stored)) {
      setTagGroupKey(stored);
      return;
    }
    if (tagGroupKeys[0]) setTagGroupKey(tagGroupKeys[0]);
  }, [groupBy, tagGroupKeys, tagGroupKey, searchParams]);

  React.useEffect(() => {
    if (!hasLoaded) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.startsWith("resource=") || resources.length === 0) return;
    const address = decodeURIComponent(hash.slice("resource=".length));
    const match = resources.find((r) => r.address === address);
    if (match) {
      setDetailResource(match);
      setDetailOpen(true);
      document.getElementById(resourceDomId(address))?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [resources, hasLoaded]);

  const sidebarFiltered = React.useMemo(
    () =>
      filterResources(resources, {
        ...filters,
        statuses: new Set(),
      }),
    [resources, filters],
  );

  const filtered = React.useMemo(() => {
    const base = filterResources(sidebarFiltered, {
      search: "",
      statuses: activeStatuses,
      providers: new Set(),
      categories: new Set(),
      modules: new Set(),
      tags: new Set(),
    });
    return sortResources(base, sortKey, sortDir);
  }, [sidebarFiltered, activeStatuses, sortKey, sortDir]);

  const facetSummary = React.useMemo(
    () => summariseResources(sidebarFiltered),
    [sidebarFiltered],
  );

  const { providers, categories, modules, tags } = React.useMemo(
    () => buildFacets(sidebarFiltered),
    [sidebarFiltered],
  );

  const toggleSet = (key: "providers" | "categories" | "modules" | "tags", value: string) => {
    setFilters((prev) => {
      const set = new Set(prev[key]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...prev, [key]: set };
    });
  };

  const clearFilters = React.useCallback(() => {
    setActiveStatuses(new Set());
    setFilters(emptyFilters());
  }, []);

  const setSearch = React.useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, search: value }));
  }, []);

  const setGroupByMode = React.useCallback((mode: GroupByMode) => {
    setGroupBy(mode);
    localStorage.setItem(GROUP_BY_KEY, mode);
  }, []);

  const setTagGroupKeyMode = React.useCallback((key: string) => {
    setTagGroupKey(key);
    localStorage.setItem(TAG_GROUP_KEY, key);
  }, []);

  const openDetails = React.useCallback((resource: Resource) => {
    setDetailResource(resource);
    setDetailOpen(true);
    window.location.hash = `resource=${encodeURIComponent(resource.address)}`;
  }, []);

  const filterByTag = React.useCallback((tag: string) => {
    setFilters((prev) => {
      const next = new Set(prev.tags);
      next.add(tag);
      return { ...prev, tags: next };
    });
  }, []);

  const clearProviderFilters = React.useCallback(() => {
    setFilters((prev) => ({ ...prev, providers: new Set() }));
  }, []);

  const applyPreset = React.useCallback((presetId: string) => {
    const preset = QUICK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const patch = preset.apply();
    if (patch.statuses) setActiveStatuses(patch.statuses);
    if (patch.search !== undefined) {
      setFilters((prev) => ({ ...prev, search: patch.search ?? "" }));
    }
    toast(`Applied “${preset.label}” filter`);
  }, [toast]);

  const applySavedView = React.useCallback((view: SavedView) => {
    const params = new URLSearchParams(view.query);
    const fromUrl = filtersFromSearchParams(params);
    setFilters({ ...fromUrl, statuses: new Set() });
    setActiveStatuses(new Set(fromUrl.statuses));
    setGroupBy(groupByFromParams(params));
    toast(`Loaded view “${view.name}”`);
  }, [toast]);

  const saveCurrentView = React.useCallback(() => {
    const name = window.prompt("Name this view");
    if (!name?.trim()) return;
    const params = filtersToSearchParams(filters, groupBy, tagGroupKey);
    if (activeStatuses.size) params.set("status", [...activeStatuses].join(","));
    setSavedViews(saveView(name.trim(), params.toString()));
    toast(`Saved view “${name.trim()}”`);
  }, [filters, groupBy, tagGroupKey, activeStatuses, toast]);

  const focusSearch = React.useCallback(() => {
    document.getElementById("resource-search")?.focus();
  }, []);

  useDashboardHotkeys({
    onFocusSearch: focusSearch,
    onOpenCommand: () => setCommandOpen(true),
    onRefresh: () => void refresh(),
    onClearFilters: clearFilters,
    onShowShortcuts: () => setShortcutsOpen(true),
  });

  const handleWorkspaceSwitch = React.useCallback(
    async (workspace: string) => {
      try {
        await switchWorkspace(workspace);
        toast(`Switched to workspace “${workspace}”`);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Could not switch workspace");
      }
    },
    [switchWorkspace, toast],
  );

  const activeCount =
    filterActiveCount(filters) + activeStatuses.size;

  const filterSummary = React.useMemo(() => {
    const parts: string[] = [];
    if (search.trim()) parts.push(`q=${search.trim()}`);
    if (activeStatuses.size) parts.push(`status=${[...activeStatuses].join(",")}`);
    if (activeProviders.size) parts.push(`provider=${[...activeProviders].join(",")}`);
    if (activeCategories.size) parts.push(`category=${[...activeCategories].join(",")}`);
    if (activeModules.size) parts.push(`module=${[...activeModules].join(",")}`);
    if (activeTags.size) parts.push(`tag=${[...activeTags].join(",")}`);
    return parts.join("&") || "none";
  }, [
    search,
    activeStatuses,
    activeProviders,
    activeCategories,
    activeModules,
    activeTags,
  ]);

  const filterSidebar = (
    <FilterSidebar
      search={search}
      onSearchChange={setSearch}
      providers={providers}
      activeProviders={activeProviders}
      onProviderToggle={(v) => toggleSet("providers", v)}
      categories={categories}
      activeCategories={activeCategories}
      onCategoryToggle={(v) => toggleSet("categories", v)}
      modules={modules}
      activeModules={activeModules}
      onModuleToggle={(v) => toggleSet("modules", v)}
      tags={tags}
      activeTags={activeTags}
      onTagToggle={(v) => toggleSet("tags", v)}
      activeCount={activeCount}
      onClear={clearFilters}
      onApplyPreset={applyPreset}
      savedViews={savedViews}
      onApplySavedView={applySavedView}
      onSaveCurrentView={saveCurrentView}
      onDeleteSavedView={(id) => setSavedViews(deleteView(id))}
    />
  );

  const filterChips = buildFilterChips({
    search,
    statuses: activeStatuses,
    providers: activeProviders,
    categories: activeCategories,
    modules: activeModules,
    tags: activeTags,
    onRemoveSearch: () => setSearch(""),
    onRemoveStatus: (s) =>
      setActiveStatuses((prev) => {
        const next = new Set(prev);
        next.delete(s);
        return next;
      }),
    onRemoveProvider: (p) =>
      setFilters((prev) => {
        const next = new Set(prev.providers);
        next.delete(p);
        return { ...prev, providers: next };
      }),
    onRemoveCategory: (c) =>
      setFilters((prev) => {
        const next = new Set(prev.categories);
        next.delete(c);
        return { ...prev, categories: next };
      }),
    onRemoveModule: (m) =>
      setFilters((prev) => {
        const next = new Set(prev.modules);
        next.delete(m);
        return { ...prev, modules: next };
      }),
    onRemoveTag: (t) =>
      setFilters((prev) => {
        const next = new Set(prev.tags);
        next.delete(t);
        return { ...prev, tags: next };
      }),
  });

  return (
    <div className="min-h-svh bg-background">
      <Header
        title={pageTitle}
        backendType={snapshot?.backend_type ?? ""}
        generatedAt={snapshot?.generated_at}
        connectionState={connectionState}
        version={version}
        headline={headline}
        resourceCount={filtered.length}
        totalResources={snapshot?.summary.total}
        refreshing={refreshing}
        onRefresh={refresh}
        authRequired={authRequired && !unauthorized}
        onSignOut={signOut}
        onOpenCommand={() => setCommandOpen(true)}
        onShowShortcuts={() => setShortcutsOpen(true)}
        workspaceSwitcher={
          <WorkspaceSwitcher
            current={snapshot?.terraform_workspace ?? "default"}
            workspaces={snapshot?.available_workspaces}
            switching={switchingWorkspace}
            onSwitch={(ws) => void handleWorkspaceSwitch(ws)}
            className="hidden w-[9rem] sm:flex"
          />
        }
        exportMenu={
          snapshot ? (
            <ExportMenu
              resources={filtered}
              generatedAt={snapshot.generated_at}
              workingDir={snapshot.working_dir}
              filterSummary={filterSummary}
            />
          ) : null
        }
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

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        resources={sidebarFiltered}
        onRefresh={refresh}
        onClearFilters={clearFilters}
        onViewDetails={openDetails}
      />

      <ResourceDetailSheet
        resource={detailResource}
        open={detailOpen}
        onFilterTag={filterByTag}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setDetailResource(null);
            if (window.location.hash.startsWith("#resource=")) {
              history.replaceState(null, "", window.location.pathname + window.location.search);
            }
          }
        }}
      />

      <div className="mx-auto flex w-full max-w-screen-2xl gap-6 px-6 py-6 lg:px-8">
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
              {error ? (
                <StaleDataBanner message={error} onRetry={refresh} />
              ) : null}
              <AttentionBanner
                summary={facetSummary}
                onFilterStatus={setActiveStatuses}
              />
              <DriftAlertsBanner
                alerts={snapshot.drift_alerts}
                checkedAt={snapshot.drift_checked_at}
              />
              <StateInfoBar
                backendType={snapshot.backend_type}
                stateSerial={snapshot.state_serial}
                stateModifiedAt={snapshot.state_modified_at}
                terraformWorkspace={snapshot.terraform_workspace}
              />
              <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
                <StatusChart
                  summary={facetSummary}
                  activeStatuses={activeStatuses}
                  onStatusToggle={(status) => {
                    setActiveStatuses((prev) => {
                      const next = new Set(prev);
                      if (next.has(status)) next.delete(status);
                      else next.add(status);
                      return next;
                    });
                  }}
                />
                <ProviderBreakdown
                  summary={facetSummary}
                  activeProviders={activeProviders}
                  onProviderToggle={(p) => toggleSet("providers", p)}
                  onClearProviders={clearProviderFilters}
                />
              </div>
              <SummaryBar
                summary={facetSummary}
                activeStatuses={activeStatuses}
                onStatusToggle={(status) => {
                  setActiveStatuses((prev) => {
                    const next = new Set(prev);
                    if (next.has(status)) next.delete(status);
                    else next.add(status);
                    return next;
                  });
                }}
              />
              <FilterChips chips={filterChips} onClearAll={clearFilters} />
              <ErrorsBanner errors={snapshot.errors} />
              <ViewToolbar
                viewMode={viewMode}
                onViewModeChange={(mode) => {
                  setViewMode(mode);
                  localStorage.setItem(VIEW_MODE_KEY, mode);
                }}
                groupBy={groupBy}
                onGroupByChange={setGroupByMode}
                tagGroupKey={tagGroupKey}
                tagGroupKeys={tagGroupKeys}
                onTagGroupKeyChange={setTagGroupKeyMode}
                sortKey={sortKey}
                sortDir={sortDir}
                onSortKeyChange={(k) => {
                  setSortKey(k);
                  localStorage.setItem(SORT_KEY, k);
                }}
                onSortDirChange={(d) => {
                  setSortDir(d);
                  localStorage.setItem(SORT_DIR_KEY, d);
                }}
                density={density}
                onDensityChange={(d) => {
                  setDensity(d);
                  localStorage.setItem(DENSITY_KEY, d);
                }}
                onExpandAll={() =>
                  setGridSignal({ action: "expand", seq: Date.now() })
                }
                onCollapseAll={() =>
                  setGridSignal({ action: "collapse", seq: Date.now() })
                }
                resourceCount={filtered.length}
              />
              {viewMode === "graph" ? (
                <DependencyGraphView
                  resources={resources}
                  graph={snapshot.dependency_graph ?? { edges: [] }}
                  onSelectResource={openDetails}
                />
              ) : (
                <ResourceGrid
                  resources={filtered}
                  totalBeforeFilter={sidebarFiltered.length}
                  showCostColumn={showCostColumn}
                  groupBy={groupBy}
                  tagGroupKey={tagGroupKey}
                  density={density}
                  onViewDetails={openDetails}
                  gridSignal={gridSignal}
                />
              )}
              <footer className="space-y-1 pt-2 text-center text-xs text-muted-foreground">
                <CopyText
                  value={snapshot.working_dir}
                  mono
                  className="justify-center"
                />
                <p>
                  showing {filtered.length} of {sidebarFiltered.length} resources
                  {sidebarFiltered.length !== resources.length
                    ? ` (${resources.length} total)`
                    : ""}
                  {" · "}
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => setCommandOpen(true)}
                  >
                    ⌘K jump
                  </button>
                </p>
              </footer>
            </>
          ) : null}
        </main>
      </div>

      <Sheet open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <SheetContent side="right" className="w-80">
          <SheetHeader>
            <SheetTitle>Keyboard shortcuts</SheetTitle>
          </SheetHeader>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>
              <kbd className="rounded bg-muted px-1">/</kbd> focus search
            </li>
            <li>
              <kbd className="rounded bg-muted px-1">Ctrl+K</kbd> command palette
            </li>
            <li>
              <kbd className="rounded bg-muted px-1">r</kbd> refresh
            </li>
            <li>
              <kbd className="rounded bg-muted px-1">Esc</kbd> clear filters
            </li>
            <li>
              <kbd className="rounded bg-muted px-1">?</kbd> this panel
            </li>
          </ul>
        </SheetContent>
      </Sheet>
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
        Start the API in another terminal:{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          go run ./cmd/terraview serve ./testdata/sample-project --no-ui
        </code>
        <br />
        Then run the UI:{" "}
        <code className="rounded bg-muted px-1 py-0.5">cd ui && npm run dev</code>
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
