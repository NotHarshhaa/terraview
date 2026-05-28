"use client";

import { memo } from "react";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { StatusBadge } from "@/components/status-badge";
import { CloudResourceIcon } from "@/lib/cloud-icons";
import type { Resource } from "@/lib/types";
import { cn } from "@/lib/utils";

export type DependencyNodeData = {
  resource: Resource;
  selected?: boolean;
  isolated?: boolean;
};

function DependencyGraphNodeComponent({
  data,
  selected,
}: NodeProps<Node<DependencyNodeData>>) {
  const { resource } = data;
  const active = selected || data.selected;
  const isolated = data.isolated;

  return (
    <div
      className={cn(
        "w-[220px] border bg-card px-3 py-2.5 shadow-sm ring-1 transition-shadow",
        isolated
          ? "border-dashed border-border/80 bg-muted/20 ring-foreground/5"
          : active
            ? "border-foreground/30 ring-foreground/20 shadow-md"
            : "border-border ring-foreground/5 hover:ring-foreground/10",
      )}
    >
      {!isolated ? (
        <Handle
          type="target"
          position={Position.Top}
          className="!size-2.5 !border-2 !border-background !bg-primary"
        />
      ) : null}

      <div className="flex min-w-0 items-start gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center border bg-background ring-1 ring-foreground/5">
          <CloudResourceIcon
            provider={resource.category.provider}
            service={resource.category.service}
            resourceType={resource.type}
            className="size-4"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium leading-none">{resource.name}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {resource.type}
          </p>
          <StatusBadge status={resource.status} withDot className="mt-1.5" />
        </div>
      </div>

      {!isolated ? (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!size-2.5 !border-2 !border-background !bg-primary"
        />
      ) : null}
    </div>
  );
}

export const DependencyGraphNode = memo(DependencyGraphNodeComponent);
