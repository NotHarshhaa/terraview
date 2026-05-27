/**
 * Filter helpers shared by the dashboard, URL sync and export.
 */

import type { Facet } from "@/components/filter-sidebar";
import type { Resource, Status, Summary } from "@/lib/types";

export type GroupByMode = "category" | "module";

export interface FilterState {
  search: string;
  statuses: Set<Status>;
  providers: Set<string>;
  categories: Set<string>;
  modules: Set<string>;
  tags: Set<string>;
}

export function emptyFilters(): FilterState {
  return {
    search: "",
    statuses: new Set(),
    providers: new Set(),
    categories: new Set(),
    modules: new Set(),
    tags: new Set(),
  };
}

export function filterActiveCount(f: FilterState): number {
  return (
    f.statuses.size +
    f.providers.size +
    f.categories.size +
    f.modules.size +
    f.tags.size +
    (f.search.trim() ? 1 : 0)
  );
}

export function filterResources(resources: Resource[], f: FilterState): Resource[] {
  const needle = f.search.trim().toLowerCase();
  return resources.filter((r) => {
    if (f.statuses.size && !f.statuses.has(r.status)) return false;
    if (f.providers.size && !f.providers.has(r.category.provider)) return false;
    if (f.categories.size && !f.categories.has(r.category.service)) return false;
    if (f.modules.size && !f.modules.has(r.module || "(root)")) return false;
    if (f.tags.size && !resourceMatchesTags(r, f.tags)) return false;
    if (needle) {
      const hay =
        `${r.address} ${r.type} ${r.name} ${Object.entries(r.tags ?? {})
          .map(([k, v]) => `${k}=${v}`)
          .join(" ")}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

function resourceMatchesTags(r: Resource, tags: Set<string>): boolean {
  if (!r.tags || tags.size === 0) return false;
  for (const t of tags) {
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq);
    const val = t.slice(eq + 1);
    if (r.tags[key] === val) return true;
  }
  return false;
}

export function summariseResources(resources: Resource[]): Summary {
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

export function buildFacets(resources: Resource[]) {
  const tally = (key: (r: Resource) => string) => {
    const m = new Map<string, number>();
    for (const r of resources) {
      const k = key(r);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map<Facet>(([value, count]) => ({ value, label: value, count }));
  };

  const tagFacets: Facet[] = [];
  const tagCounts = new Map<string, number>();
  for (const r of resources) {
    for (const [k, v] of Object.entries(r.tags ?? {})) {
      const label = `${k}=${v}`;
      tagCounts.set(label, (tagCounts.get(label) ?? 0) + 1);
    }
  }
  for (const [value, count] of [...tagCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )) {
    tagFacets.push({ value, label: value, count });
  }

  const serviceCounts = new Map<string, number>();
  const serviceProviders = new Map<string, Map<string, number>>();
  for (const r of resources) {
    const service = r.category.service;
    if (!service) continue;
    serviceCounts.set(service, (serviceCounts.get(service) ?? 0) + 1);
    const byProvider =
      serviceProviders.get(service) ?? new Map<string, number>();
    byProvider.set(
      r.category.provider,
      (byProvider.get(r.category.provider) ?? 0) + 1,
    );
    serviceProviders.set(service, byProvider);
  }

  const categories: Facet[] = [...serviceCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => {
      const providers = serviceProviders.get(value);
      let iconProvider: string | undefined;
      if (providers?.size) {
        iconProvider = [...providers.entries()].sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
        )[0][0];
      }
      return { value, label: value, count, iconProvider };
    });

  return {
    providers: tally((r) => r.category.provider),
    categories,
    modules: tally((r) => r.module || "(root)"),
    tags: tagFacets.slice(0, 24),
  };
}

export function parseFilterSpec(spec: string): Partial<FilterState> {
  const out: Partial<FilterState> = {
    statuses: new Set(),
    providers: new Set(),
    categories: new Set(),
    modules: new Set(),
    tags: new Set(),
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
      case "tag":
        value.split(",").forEach((s) => {
          const t = s.trim();
          if (t) out.tags!.add(t);
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

export function filtersFromSearchParams(params: URLSearchParams): FilterState {
  const f = emptyFilters();
  const q = params.get("q") ?? params.get("search");
  if (q) f.search = q;

  const addCsv = (key: string, add: (v: string) => void) => {
    const raw = params.get(key);
    if (!raw) return;
    raw.split(",").forEach((v) => {
      const t = v.trim();
      if (t) add(t);
    });
  };

  addCsv("status", (v) => f.statuses.add(v as Status));
  addCsv("provider", (v) => f.providers.add(v));
  addCsv("category", (v) => f.categories.add(v));
  addCsv("module", (v) => f.modules.add(v));
  addCsv("tag", (v) => f.tags.add(v));
  return f;
}

export function filtersToSearchParams(
  f: FilterState,
  groupBy: GroupByMode,
): URLSearchParams {
  const params = new URLSearchParams();
  if (f.search.trim()) params.set("q", f.search.trim());
  if (f.statuses.size) params.set("status", [...f.statuses].join(","));
  if (f.providers.size) params.set("provider", [...f.providers].join(","));
  if (f.categories.size) params.set("category", [...f.categories].join(","));
  if (f.modules.size) params.set("module", [...f.modules].join(","));
  if (f.tags.size) params.set("tag", [...f.tags].join(","));
  if (groupBy === "module") params.set("group", "module");
  return params;
}

export function groupByFromParams(params: URLSearchParams): GroupByMode {
  return params.get("group") === "module" ? "module" : "category";
}

export function resourceDomId(address: string): string {
  return `resource-${encodeURIComponent(address)}`;
}

export function mergeFilters(
  base: FilterState,
  patch: Partial<FilterState>,
): FilterState {
  return {
    search: patch.search ?? base.search,
    statuses: patch.statuses ?? base.statuses,
    providers: patch.providers ?? base.providers,
    categories: patch.categories ?? base.categories,
    modules: patch.modules ?? base.modules,
    tags: patch.tags ?? base.tags,
  };
}
