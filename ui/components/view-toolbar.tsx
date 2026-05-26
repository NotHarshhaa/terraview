"use client";

import {
  IconChevronsDown,
  IconChevronsUp,
  IconLayoutGrid,
  IconList,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GroupByMode } from "@/lib/filters";
import {
  SORT_OPTIONS,
  type Density,
  type SortDir,
  type SortKey,
} from "@/lib/views";

interface ViewToolbarProps {
  groupBy: GroupByMode;
  onGroupByChange: (mode: GroupByMode) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortKeyChange: (key: SortKey) => void;
  onSortDirChange: (dir: SortDir) => void;
  density: Density;
  onDensityChange: (density: Density) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  resourceCount: number;
}

export function ViewToolbar({
  groupBy,
  onGroupByChange,
  sortKey,
  sortDir,
  onSortKeyChange,
  onSortDirChange,
  density,
  onDensityChange,
  onExpandAll,
  onCollapseAll,
  resourceCount,
}: ViewToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs
        value={groupBy}
        onValueChange={(v) => onGroupByChange(v as GroupByMode)}
      >
        <TabsList>
          <TabsTrigger value="category">By service</TabsTrigger>
          <TabsTrigger value="module">By module</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {resourceCount} shown
        </span>

        <Select value={sortKey} onValueChange={(v) => onSortKeyChange(v as SortKey)}>
          <SelectTrigger size="sm" className="w-[7.5rem]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onSortDirChange(sortDir === "asc" ? "desc" : "asc")}
          title={sortDir === "asc" ? "Ascending" : "Descending"}
        >
          {sortDir === "asc" ? "↑" : "↓"}
        </Button>

        <Button
          variant={density === "compact" ? "secondary" : "outline"}
          size="icon-sm"
          onClick={() =>
            onDensityChange(density === "compact" ? "comfortable" : "compact")
          }
          title={density === "compact" ? "Comfortable density" : "Compact density"}
        >
          {density === "compact" ? (
            <IconList className="size-4" />
          ) : (
            <IconLayoutGrid className="size-4" />
          )}
        </Button>

        <Button variant="outline" size="icon-sm" onClick={onExpandAll} title="Expand all">
          <IconChevronsDown className="size-4" />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={onCollapseAll} title="Collapse all">
          <IconChevronsUp className="size-4" />
        </Button>
      </div>
    </div>
  );
}
