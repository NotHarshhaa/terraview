import dagre from "@dagrejs/dagre";

import type { DependencyEdge, Resource } from "./types";

export const GRAPH_NODE_WIDTH = 220;
export const GRAPH_NODE_HEIGHT = 92;

const ISOLATED_GAP = 72;
const ISOLATED_COLUMN_PAD = 40;
const ROW_GAP = 20;

export interface GraphLayoutNode {
  id: string;
  resource: Resource;
  x: number;
  y: number;
  isolated?: boolean;
}

export interface GraphLayoutResult {
  nodes: GraphLayoutNode[];
  width: number;
  height: number;
  connectedCount: number;
  isolatedCount: number;
}

export function layoutDependencyGraph(
  resources: Resource[],
  edges: DependencyEdge[],
): GraphLayoutResult {
  if (edges.length === 0) {
    const flat = layoutByCategory(resources);
    return { ...flat, connectedCount: 0, isolatedCount: resources.length };
  }
  return layoutConnectedAndIsolated(resources, edges);
}

function layoutConnectedAndIsolated(
  resources: Resource[],
  edges: DependencyEdge[],
): GraphLayoutResult {
  const linked = new Set<string>();
  for (const edge of edges) {
    linked.add(edge.from);
    linked.add(edge.to);
  }

  const connectedResources = resources.filter((r) => linked.has(r.address));
  const isolatedResources = resources.filter((r) => !linked.has(r.address));

  const connectedLayout = layoutWithDagre(connectedResources, edges);
  const nodes: GraphLayoutNode[] = connectedLayout.nodes.map((n) => ({ ...n, isolated: false }));

  if (isolatedResources.length === 0) {
    return {
      nodes,
      width: connectedLayout.width,
      height: connectedLayout.height,
      connectedCount: connectedResources.length,
      isolatedCount: 0,
    };
  }

  const chainHeight = connectedLayout.height;
  const isolatedColumnX = connectedLayout.width + ISOLATED_GAP;
  const isolatedBlockHeight =
    isolatedResources.length * GRAPH_NODE_HEIGHT +
    Math.max(0, isolatedResources.length - 1) * ROW_GAP +
    ISOLATED_COLUMN_PAD * 2;

  const isolatedStartY = Math.max(
    ISOLATED_COLUMN_PAD,
    (chainHeight - isolatedBlockHeight) / 2,
  );

  isolatedResources
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((resource, index) => {
      nodes.push({
        id: resource.address,
        resource,
        x: isolatedColumnX,
        y: isolatedStartY + index * (GRAPH_NODE_HEIGHT + ROW_GAP),
        isolated: true,
      });
    });

  return {
    nodes,
    width: isolatedColumnX + GRAPH_NODE_WIDTH + ISOLATED_COLUMN_PAD,
    height: Math.max(chainHeight, isolatedStartY + isolatedBlockHeight),
    connectedCount: connectedResources.length,
    isolatedCount: isolatedResources.length,
  };
}

function layoutWithDagre(resources: Resource[], edges: DependencyEdge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 80,
    ranksep: 120,
    marginx: 56,
    marginy: 56,
    align: "UL",
  });

  for (const resource of resources) {
    g.setNode(resource.address, {
      width: GRAPH_NODE_WIDTH,
      height: GRAPH_NODE_HEIGHT,
    });
  }
  for (const edge of edges) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  let maxX = 0;
  let maxY = 0;
  const nodes: GraphLayoutNode[] = resources.map((resource) => {
    const pos = g.node(resource.address);
    const x = pos.x - GRAPH_NODE_WIDTH / 2;
    const y = pos.y - GRAPH_NODE_HEIGHT / 2;
    maxX = Math.max(maxX, x + GRAPH_NODE_WIDTH);
    maxY = Math.max(maxY, y + GRAPH_NODE_HEIGHT);
    return { id: resource.address, resource, x, y };
  });

  return {
    nodes,
    width: maxX + 56,
    height: maxY + 56,
  };
}

function layoutByCategory(resources: Resource[]) {
  const groups = new Map<string, Resource[]>();
  for (const resource of resources) {
    const key = `${resource.category.provider} › ${resource.category.service}`;
    const list = groups.get(key) ?? [];
    list.push(resource);
    groups.set(key, list);
  }

  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const columnGap = 48;
  const pad = 48;

  let x = pad;
  let maxWidth = pad;
  let maxHeight = pad;
  const nodes: GraphLayoutNode[] = [];

  for (const [, items] of sortedGroups) {
    items.sort((a, b) => a.name.localeCompare(b.name));
    items.forEach((resource, index) => {
      const y = pad + index * (GRAPH_NODE_HEIGHT + ROW_GAP);
      nodes.push({ id: resource.address, resource, x, y, isolated: true });
      maxHeight = Math.max(maxHeight, y + GRAPH_NODE_HEIGHT + pad);
    });
    maxWidth = Math.max(maxWidth, x + GRAPH_NODE_WIDTH + pad);
    x += GRAPH_NODE_WIDTH + columnGap;
  }

  return { nodes, width: maxWidth, height: maxHeight };
}
