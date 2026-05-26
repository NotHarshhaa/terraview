/**
 * Quick filter presets for common operator workflows.
 */

import type { FilterState } from "@/lib/filters";
import type { Status } from "@/lib/types";

import type { Resource } from "@/lib/types";

export interface QuickPreset {
  id: string;
  label: string;
  description: string;
  apply: () => Partial<FilterState> & { statuses?: Set<Status> };
}

export const QUICK_PRESETS: QuickPreset[] = [
  {
    id: "attention",
    label: "Needs attention",
    description: "Drift, pending changes, inactive or unmanaged",
    apply: () => ({
      statuses: new Set<Status>([
        "drifted",
        "pending_create",
        "pending_update",
        "pending_destroy",
        "inactive",
        "unmanaged",
      ]),
    }),
  },
  {
    id: "drift",
    label: "Drifted",
    description: "Resources with provider drift",
    apply: () => ({ statuses: new Set<Status>(["drifted"]) }),
  },
  {
    id: "pending",
    label: "Pending changes",
    description: "Planned creates, updates or destroys",
    apply: () => ({
      statuses: new Set<Status>([
        "pending_create",
        "pending_update",
        "pending_destroy",
      ]),
    }),
  },
  {
    id: "healthy",
    label: "Healthy",
    description: "Created and reporting healthy",
    apply: () => ({ statuses: new Set<Status>(["created"]) }),
  },
  {
    id: "unmanaged",
    label: "Unmanaged",
    description: "Declared in HCL but not in state",
    apply: () => ({ statuses: new Set<Status>(["unmanaged"]) }),
  },
];

export type SortKey = "name" | "status" | "type" | "address";
export type SortDir = "asc" | "desc";

export type Density = "comfortable" | "compact";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "status", label: "Status" },
  { value: "type", label: "Type" },
  { value: "address", label: "Address" },
];

const STATUS_RANK: Record<string, number> = {
  drifted: 0,
  pending_destroy: 1,
  pending_update: 2,
  pending_create: 3,
  inactive: 4,
  unmanaged: 5,
  unknown: 6,
  created: 7,
};

export function sortResources(
  resources: Resource[],
  key: SortKey,
  dir: SortDir,
): Resource[] {
  const out = [...resources];
  const mul = dir === "asc" ? 1 : -1;
  out.sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "status":
        cmp =
          (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
        break;
      case "type":
        cmp = a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
        break;
      case "address":
        cmp = a.address.localeCompare(b.address);
        break;
      default:
        cmp = a.name.localeCompare(b.name) || a.address.localeCompare(b.address);
    }
    return cmp * mul;
  });
  return out;
}
