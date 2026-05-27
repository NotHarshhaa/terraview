/**
 * Mirrors the Go `internal/models` shape that the API serves. These types are
 * the contract between the Go backend and the Next.js UI; if you change a
 * field name here, change it in the Go struct too (or the dashboard silently
 * starts rendering `undefined`).
 *
 * We keep the type names singular and the union members lowercase so they
 * line up 1:1 with the JSON payload — no transformation step needed.
 */

export type Status =
  | "created"
  | "inactive"
  | "pending_create"
  | "pending_destroy"
  | "pending_update"
  | "drifted"
  | "unmanaged"
  | "unknown";

/** Order used everywhere statuses are displayed (summary bar, filters). */
export const STATUS_ORDER: Status[] = [
  "created",
  "pending_create",
  "pending_update",
  "pending_destroy",
  "inactive",
  "drifted",
  "unmanaged",
  "unknown",
];

export interface Category {
  provider: string;
  service: string;
}

export interface Resource {
  address: string;
  name: string;
  type: string;
  provider: string;
  module: string;
  category: Category;
  status: Status;
  status_reason?: string;
  attributes?: Record<string, string>;
  tags?: Record<string, string>;
  monthly_cost?: number;
  last_changed?: string;
  plan_action?: string;
  drift_attributes?: string[];
}

export interface Summary {
  total: number;
  by_status: Partial<Record<Status, number>>;
  by_provider: Record<string, number>;
  by_category: Record<string, number>;
  total_monthly_cost?: number;
}

export interface SnapshotError {
  source: "hcl" | "state" | "plan" | "backend" | string;
  message: string;
}

export interface Snapshot {
  generated_at: string;
  working_dir: string;
  backend_type: string;
  resources: Resource[];
  summary: Summary;
  errors?: SnapshotError[];
  ui?: UISettings;
  state_serial?: number;
  state_modified_at?: string;
}

export interface StatusPayload {
  generated_at: string;
  backend_type: string;
  total: number;
  by_status: Partial<Record<Status, number>>;
  by_provider: Record<string, number>;
  total_monthly_cost?: number;
  headline: string;
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface FacetsPayload {
  generated_at: string;
  total: number;
  facets: {
    providers: FacetCount[];
    categories: FacetCount[];
    modules: FacetCount[];
    tags: FacetCount[];
    statuses: FacetCount[];
  };
}

export interface UISettings {
  title?: string;
  show_cost_column?: boolean;
  default_filter?: string;
  auth_required?: boolean;
}

/** Display metadata for plan actions shown alongside pending statuses. */
export const PLAN_ACTION_META: Record<string, { label: string }> = {
  create: { label: "Create" },
  update: { label: "Update" },
  delete: { label: "Delete" },
  replace: { label: "Replace" },
};

/** Display metadata for each status: label, dot colour, foreground/background classes. */
export const STATUS_META: Record<
  Status,
  { label: string; dot: string; pill: string; description: string }
> = {
  created: {
    label: "Created",
    dot: "bg-emerald-500",
    pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
    description: "Resource exists and is reporting healthy.",
  },
  inactive: {
    label: "Inactive",
    dot: "bg-amber-500",
    pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
    description: "Exists but stopped, disabled or paused.",
  },
  pending_create: {
    label: "Pending create",
    dot: "bg-sky-500",
    pill: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20",
    description: "Planned to be created on the next apply.",
  },
  pending_update: {
    label: "Pending update",
    dot: "bg-violet-500",
    pill: "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20",
    description: "Planned to be modified on the next apply.",
  },
  pending_destroy: {
    label: "Pending destroy",
    dot: "bg-rose-500",
    pill: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
    description: "Planned to be destroyed on the next apply.",
  },
  drifted: {
    label: "Drifted",
    dot: "bg-fuchsia-500",
    pill: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 ring-fuchsia-500/20",
    description: "State diverges from the provider-reported reality.",
  },
  unmanaged: {
    label: "Unmanaged",
    dot: "bg-zinc-500",
    pill: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 ring-zinc-500/20",
    description: "Declared in .tf but absent from state and plan.",
  },
  unknown: {
    label: "Unknown",
    dot: "bg-zinc-400",
    pill: "bg-zinc-400/10 text-zinc-500 dark:text-zinc-400 ring-zinc-400/20",
    description: "Status could not be determined.",
  },
};
