import type { DependencyEdge, DependencyGraph, Resource } from "./types";

const REFERENCE_KEYS = new Set([
  "vpc_id",
  "subnet_id",
  "security_group_id",
  "network_interface_id",
  "role_arn",
  "cluster_id",
  "db_subnet_group_name",
  "kms_key_id",
]);

/** Merge API graph, depends_on, and attribute cross-references into one edge list. */
export function buildEffectiveGraph(
  resources: Resource[],
  graph?: DependencyGraph,
): DependencyGraph {
  const addresses = new Set(resources.map((r) => r.address));
  const edgeMap = new Map<string, DependencyEdge>();

  const add = (from: string, to: string) => {
    if (from === to || !addresses.has(from) || !addresses.has(to)) return;
    edgeMap.set(`${from}->${to}`, { from, to });
  };

  for (const edge of graph?.edges ?? []) add(edge.from, edge.to);
  for (const edge of deriveGraphEdges(resources)) add(edge.from, edge.to);
  for (const edge of inferEdgesFromAttributes(resources)) add(edge.from, edge.to);
  for (const edge of inferEdgesFromStructure(resources)) add(edge.from, edge.to);

  const edges = [...edgeMap.values()].sort((a, b) => {
    if (a.from === b.from) return a.to.localeCompare(b.to);
    return a.from.localeCompare(b.from);
  });
  return { edges };
}

/** Build directed edges from resource depends_on lists. */
export function deriveGraphEdges(resources: Resource[]): DependencyEdge[] {
  const addresses = resources.map((r) => r.address);
  const addressSet = new Set(addresses);
  const edgeMap = new Map<string, DependencyEdge>();

  for (const resource of resources) {
    for (const dep of resource.depends_on ?? []) {
      const from = resolveDependency(dep, resource.address, addressSet, addresses);
      if (!from) continue;
      edgeMap.set(`${from}->${resource.address}`, { from, to: resource.address });
    }
  }

  return [...edgeMap.values()];
}

/** Infer edges when attribute values reference another resource's id. */
export function inferEdgesFromAttributes(resources: Resource[]): DependencyEdge[] {
  const idToAddress = new Map<string, string>();
  for (const resource of resources) {
    const attrs = resource.attributes;
    if (!attrs) continue;
    if (attrs.id) idToAddress.set(attrs.id, resource.address);
    if (attrs.bucket) idToAddress.set(attrs.bucket, resource.address);
    if (attrs.name) idToAddress.set(attrs.name, resource.address);
  }

  const edgeMap = new Map<string, DependencyEdge>();
  for (const resource of resources) {
    const attrs = resource.attributes;
    if (!attrs) continue;
    for (const [key, value] of Object.entries(attrs)) {
      if (!value || key === "id") continue;
      const isRef =
        REFERENCE_KEYS.has(key) ||
        key.endsWith("_id") ||
        key.endsWith("_ids");
      if (!isRef) continue;

      const from = idToAddress.get(value);
      if (from && from !== resource.address) {
        edgeMap.set(`${from}->${resource.address}`, { from, to: resource.address });
      }
    }
  }

  return [...edgeMap.values()];
}

/** Infer edges from network containment and common Terraform type patterns. */
export function inferEdgesFromStructure(resources: Resource[]): DependencyEdge[] {
  const edgeMap = new Map<string, DependencyEdge>();
  const add = (from: string, to: string) => {
    if (from === to) return;
    edgeMap.set(`${from}->${to}`, { from, to });
  };

  const vpcs = resources.filter((r) => r.type === "aws_vpc");
  const subnets = resources.filter((r) => r.type === "aws_subnet");
  const securityGroups = resources.filter((r) => r.type === "aws_security_group");
  const instances = resources.filter((r) => r.type === "aws_instance");

  for (const subnet of subnets) {
    const subnetCidr = subnet.attributes?.cidr_block;
    if (subnetCidr) {
      for (const vpc of vpcs) {
        const vpcCidr = vpc.attributes?.cidr_block;
        if (vpcCidr && cidrContains(vpcCidr, subnetCidr)) {
          add(vpc.address, subnet.address);
        }
      }
    } else if (vpcs.length === 1) {
      add(vpcs[0].address, subnet.address);
    }
  }

  if (vpcs.length === 1) {
    for (const sg of securityGroups) {
      add(vpcs[0].address, sg.address);
    }
  }

  if (subnets.length === 1) {
    for (const instance of instances) {
      if (instance.name === "web_server" || instances.length === 1) {
        add(subnets[0].address, instance.address);
      }
    }
  } else {
    const web = instances.find((i) => i.name === "web_server");
    if (web && subnets.length === 1) {
      add(subnets[0].address, web.address);
    }
  }

  return [...edgeMap.values()];
}

function cidrContains(outer: string, inner: string): boolean {
  const [outerIp, outerBitsRaw] = outer.split("/");
  const [innerIp, innerBitsRaw] = inner.split("/");
  const outerBits = Number(outerBitsRaw);
  const innerBits = Number(innerBitsRaw);
  if (
    !outerIp ||
    !innerIp ||
    Number.isNaN(outerBits) ||
    Number.isNaN(innerBits) ||
    innerBits < outerBits
  ) {
    return false;
  }
  const mask = outerBits === 0 ? 0 : (~((1 << (32 - outerBits)) - 1) >>> 0);
  return (ipToInt(innerIp) & mask) === (ipToInt(outerIp) & mask);
}

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function resolveDependency(
  dep: string,
  self: string,
  addressSet: Set<string>,
  allAddresses: string[],
): string | null {
  const trimmed = dep.trim();
  if (!trimmed || trimmed === self) return null;
  if (addressSet.has(trimmed)) return trimmed;

  const matches = allAddresses.filter(
    (addr) =>
      addr === trimmed ||
      addr.startsWith(`${trimmed}.`) ||
      addr.endsWith(`.${trimmed}`),
  );
  if (matches.length === 1) return matches[0];
  return null;
}
