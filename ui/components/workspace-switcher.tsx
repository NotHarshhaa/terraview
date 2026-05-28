"use client";

import * as React from "react";

import { IconLayersIntersect } from "@tabler/icons-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkspaceInfo } from "@/lib/types";

interface WorkspaceSwitcherProps {
  current?: string;
  workspaces?: WorkspaceInfo[];
  switching?: boolean;
  onSwitch: (workspace: string) => void;
  className?: string;
}

export function WorkspaceSwitcher({
  current = "default",
  workspaces,
  switching,
  onSwitch,
  className,
}: WorkspaceSwitcherProps) {
  const options = React.useMemo(() => {
    const names = new Set<string>([current]);
    for (const w of workspaces ?? []) {
      if (w.name) names.add(w.name);
    }
    return [...names].sort((a, b) => {
      if (a === "default") return -1;
      if (b === "default") return 1;
      return a.localeCompare(b);
    });
  }, [current, workspaces]);

  if (options.length <= 1) {
    return (
      <div className={className}>
        <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          <IconLayersIntersect className="size-3.5" aria-hidden />
          {current}
        </span>
      </div>
    );
  }

  return (
    <Select
      value={current}
      onValueChange={onSwitch}
      disabled={switching}
    >
      <SelectTrigger size="sm" className={className ?? "w-[9rem] gap-1.5"}>
        <IconLayersIntersect className="size-3.5 shrink-0 opacity-70" aria-hidden />
        <SelectValue placeholder="Workspace" />
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
            {name === current ? " (active)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
