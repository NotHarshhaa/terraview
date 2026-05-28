"use client";

import * as React from "react";

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { IconShare3 } from "@tabler/icons-react";

import {
  DependencyGraphNode,
  type DependencyNodeData,
} from "@/components/dependency-graph-node";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { buildEffectiveGraph } from "@/lib/graph";
import { layoutDependencyGraph } from "@/lib/graph-layout";
import type { DependencyGraph, Resource } from "@/lib/types";
import { STATUS_META, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

import "@xyflow/react/dist/style.css";

interface DependencyGraphViewProps {
  resources: Resource[];
  graph: DependencyGraph;
  onSelectResource?: (resource: Resource) => void;
  className?: string;
}

const nodeTypes = { resource: DependencyGraphNode };

function DependencyGraphCanvas({
  resources,
  graph,
  onSelectResource,
}: Omit<DependencyGraphViewProps, "className">) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const { fitView } = useReactFlow();

  const effectiveGraph = React.useMemo(
    () => buildEffectiveGraph(resources, graph),
    [resources, graph],
  );

  const layout = React.useMemo(
    () => layoutDependencyGraph(resources, effectiveGraph.edges),
    [resources, effectiveGraph.edges],
  );

  const { flowNodes, flowEdges, isolatedColumnX } = React.useMemo(() => {
    const nodes: Node<DependencyNodeData>[] = layout.nodes.map((node) => ({
      id: node.id,
      type: "resource",
      position: { x: node.x, y: node.y },
      data: { resource: node.resource, isolated: node.isolated },
      draggable: true,
    }));

    const edges: Edge[] = effectiveGraph.edges.map((edge) => ({
      id: `${edge.from}->${edge.to}`,
      source: edge.from,
      target: edge.to,
      type: "smoothstep",
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
        color: "oklch(0.45 0.02 285)",
      },
      style: {
        strokeWidth: 2.5,
        stroke: "oklch(0.45 0.02 285)",
      },
      className: "terraview-dep-edge",
    }));

    const firstIsolated = layout.nodes.find((n) => n.isolated);

    return {
      flowNodes: nodes,
      flowEdges: edges,
      isolatedColumnX: firstIsolated?.x,
    };
  }, [layout.nodes, effectiveGraph.edges]);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => {
      void fitView({ padding: 0.12, maxZoom: 1.15, duration: 300 });
    });
    return () => cancelAnimationFrame(id);
  }, [flowNodes, flowEdges, fitView]);

  const nodesWithSelection = React.useMemo(
    () =>
      flowNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          selected: node.id === selectedId,
        },
      })),
    [flowNodes, selectedId],
  );

  return (
    <>
      <ReactFlow
        nodes={nodesWithSelection}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          setSelectedId(node.id);
          onSelectResource?.(node.data.resource);
        }}
        onPaneClick={() => setSelectedId(null)}
        minZoom={0.2}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable
        elementsSelectable
        panOnScroll
        zoomOnScroll
        defaultEdgeOptions={{ zIndex: 0 }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--border)"
        />
        <Controls
          showInteractive={false}
          className="!border-border !bg-card !shadow-sm [&>button]:!border-border [&>button]:!bg-card [&>button]:hover:!bg-muted"
        />
        <MiniMap
          pannable
          zoomable
          nodeStrokeWidth={2}
          className="!h-24 !w-36 !border-border !bg-card/95 !shadow-sm"
          nodeColor={(node) => {
            const status = (node.data as DependencyNodeData)?.resource?.status;
            const dot = STATUS_META[status as Status]?.dot ?? "bg-zinc-400";
            if (dot.includes("emerald")) return "#10b981";
            if (dot.includes("amber")) return "#f59e0b";
            if (dot.includes("rose")) return "#f43f5e";
            if (dot.includes("sky")) return "#0ea5e9";
            if (dot.includes("fuchsia")) return "#d946ef";
            return "#a1a1aa";
          }}
        />
        {effectiveGraph.edges.length > 0 ? (
          <Panel position="top-left" className="pointer-events-none m-3">
            <span className="border bg-card/90 px-2 py-1 font-heading text-[10px] font-semibold tracking-wider uppercase text-muted-foreground shadow-sm">
              Dependency chain
            </span>
          </Panel>
        ) : null}
        {layout.isolatedCount > 0 && isolatedColumnX !== undefined ? (
          <Panel
            position="top-left"
            className="pointer-events-none"
            style={{ left: isolatedColumnX, top: 12 }}
          >
            <span className="border border-dashed bg-card/90 px-2 py-1 font-heading text-[10px] font-semibold tracking-wider uppercase text-muted-foreground shadow-sm">
              Standalone ({layout.isolatedCount})
            </span>
          </Panel>
        ) : null}
      </ReactFlow>
    </>
  );
}

export function DependencyGraphView({
  resources,
  graph,
  onSelectResource,
  className,
}: DependencyGraphViewProps) {
  const effectiveGraph = React.useMemo(
    () => buildEffectiveGraph(resources, graph),
    [resources, graph],
  );

  const layout = React.useMemo(
    () => layoutDependencyGraph(resources, effectiveGraph.edges),
    [resources, effectiveGraph.edges],
  );

  if (resources.length === 0) {
    return (
      <Card className="border-dashed bg-card/40 py-0 shadow-none">
        <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-center">
          <p className="font-medium">No resources to graph.</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Clear filters or switch workspace to see dependency relationships.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("gap-0 overflow-hidden py-0 shadow-sm", className)}>
      <CardHeader className="gap-0 border-b bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-heading text-xs font-semibold tracking-wider uppercase">
            <IconShare3 className="size-4 text-muted-foreground" aria-hidden />
            Dependency graph
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="normal-case tabular-nums">
              {layout.connectedCount} linked
            </Badge>
            {layout.isolatedCount > 0 ? (
              <Badge variant="secondary" className="normal-case tabular-nums">
                {layout.isolatedCount} standalone
              </Badge>
            ) : null}
            <Badge variant="outline" className="normal-case tabular-nums">
              {effectiveGraph.edges.length} edges
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="terraview-flow h-[min(72svh,680px)] w-full">
          <ReactFlowProvider>
            <DependencyGraphCanvas
              resources={resources}
              graph={graph}
              onSelectResource={onSelectResource}
            />
          </ReactFlowProvider>
        </div>
        {effectiveGraph.edges.length === 0 ? (
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            No dependency edges detected — relationships appear when state/HCL includes{" "}
            <code className="text-[11px]">depends_on</code> or cross-resource references.
          </p>
        ) : layout.isolatedCount > 0 ? (
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            Arrows show explicit dependencies. Standalone resources on the right have no upstream
            references in Terraform state or HCL.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
