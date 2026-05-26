"use client";

import * as React from "react";

import { IconX } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { STATUS_META, type Status } from "@/lib/types";

interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface FilterChipsProps {
  chips: FilterChip[];
  onClearAll: () => void;
}

export function FilterChips({ chips, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Active filters:</span>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            className="rounded-full p-0.5 hover:bg-background"
            aria-label={`Remove ${chip.label}`}
          >
            <IconX className="size-3" />
          </button>
        </span>
      ))}
      <Button variant="link" size="xs" className="h-auto px-0" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}

export function buildFilterChips(input: {
  search: string;
  statuses: Set<Status>;
  providers: Set<string>;
  categories: Set<string>;
  modules: Set<string>;
  tags: Set<string>;
  onRemoveSearch: () => void;
  onRemoveStatus: (s: Status) => void;
  onRemoveProvider: (p: string) => void;
  onRemoveCategory: (c: string) => void;
  onRemoveModule: (m: string) => void;
  onRemoveTag: (t: string) => void;
}): FilterChip[] {
  const chips: FilterChip[] = [];
  if (input.search.trim()) {
    chips.push({
      key: "q",
      label: `search: ${input.search.trim()}`,
      onRemove: input.onRemoveSearch,
    });
  }
  for (const s of input.statuses) {
    chips.push({
      key: `status-${s}`,
      label: STATUS_META[s].label,
      onRemove: () => input.onRemoveStatus(s),
    });
  }
  for (const p of input.providers) {
    chips.push({
      key: `provider-${p}`,
      label: p,
      onRemove: () => input.onRemoveProvider(p),
    });
  }
  for (const c of input.categories) {
    chips.push({
      key: `category-${c}`,
      label: c,
      onRemove: () => input.onRemoveCategory(c),
    });
  }
  for (const m of input.modules) {
    chips.push({
      key: `module-${m}`,
      label: m,
      onRemove: () => input.onRemoveModule(m),
    });
  }
  for (const t of input.tags) {
    chips.push({
      key: `tag-${t}`,
      label: t,
      onRemove: () => input.onRemoveTag(t),
    });
  }
  return chips;
}
