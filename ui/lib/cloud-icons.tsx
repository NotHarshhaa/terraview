/**
 * Maps Terraview provider + service families to thesvg cloud icons.
 * Icons live in public/icons/cloud/ — add more with:
 *   npx @thesvg/cli add <slug> --format svg --dir ./public/icons/cloud
 */

import { cn } from "@/lib/utils";

const ICON_BASE = "/icons/cloud";

const AWS_SERVICE_ICONS: Record<string, string> = {
  Compute: "aws-amazon-ec2",
  Serverless: "aws-aws-lambda",
  Containers: "aws-aws-fargate",
  Databases: "aws-amazon-rds",
  Storage: "aws-amazon-simple-storage-service",
  "Security & IAM": "aws-aws-iam-identity-center",
  "Load Balancing & CDN": "aws-amazon-cloudfront",
  Networking: "aws-group-virtual-private-cloud-vpc",
  Observability: "aws-amazon-cloudwatch",
  "Analytics & Streaming": "aws-amazon-athena",
  Other: "aws",
};

const GCP_SERVICE_ICONS: Record<string, string> = {
  Compute: "gcp-compute-engine",
  Networking: "gcp-cloud-monitoring",
  Databases: "gcp-cloud-sql",
  Storage: "gcp-cloud-storage",
  Kubernetes: "gcp-google-kubernetes-engine",
  "Security & IAM": "google-cloud",
  Serverless: "gcp-cloud-functions",
  Observability: "gcp-cloud-monitoring",
  Other: "google-cloud",
};

const AZURE_SERVICE_ICONS: Record<string, string> = {
  Compute: "azure-virtual-machines-classic",
  Databases: "azure-sql-database",
  Storage: "azure-storage-accounts",
  Networking: "azure-virtual-networks",
  Kubernetes: "azure-aks-automatic",
  "Security & IAM": "azure-key-vaults",
  Serverless: "azure-function-apps",
  Observability: "azure-monitor",
  Other: "microsoft-azure",
};

const KUBERNETES_SERVICE_ICONS: Record<string, string> = {
  Workloads: "kubernetes",
  Networking: "kubernetes",
  Storage: "kubernetes",
  "Config & Secrets": "kubernetes",
  "Security & IAM": "kubernetes",
  Other: "kubernetes",
};

const PROVIDER_DEFAULTS: Record<string, string> = {
  aws: "aws",
  gcp: "google-cloud",
  azure: "microsoft-azure",
  kubernetes: "kubernetes",
};

export function resolveCloudIconSlug(
  provider: string,
  service?: string,
): string | null {
  const p = provider.trim().toLowerCase();
  const s = service?.trim();

  switch (p) {
  case "aws":
    return (s && AWS_SERVICE_ICONS[s]) || "aws";
  case "gcp":
    return (s && GCP_SERVICE_ICONS[s]) || "google-cloud";
  case "azure":
    return (s && AZURE_SERVICE_ICONS[s]) || "microsoft-azure";
  case "kubernetes":
    return (s && KUBERNETES_SERVICE_ICONS[s]) || "kubernetes";
  default:
    return PROVIDER_DEFAULTS[p] ?? null;
  }
}

/** Infer an icon slug from a Terraform resource type. */
export function resolveCloudIconSlugFromType(resourceType: string): string | null {
  const provider = resourceType.split("_")[0]?.toLowerCase();
  if (!provider) return null;

  if (provider === "aws") {
    const suffix = resourceType.slice(4);
    if (suffix.includes("lambda") || suffix.includes("sqs") || suffix.includes("sns")) {
      return "aws-aws-lambda";
    }
    if (suffix.includes("fargate") || suffix.includes("ecs") || suffix.includes("eks")) {
      return "aws-aws-fargate";
    }
    if (suffix.includes("rds") || suffix.includes("dynamodb")) return "aws-amazon-rds";
    if (suffix.includes("s3") || suffix.includes("efs")) {
      return "aws-amazon-simple-storage-service";
    }
    if (suffix.includes("instance") || suffix.includes("ec2")) return "aws-amazon-ec2";
    if (suffix.includes("vpc") || suffix.includes("subnet")) {
      return "aws-group-virtual-private-cloud-vpc";
    }
    return "aws";
  }

  if (provider === "google") {
    if (resourceType.includes("compute_instance")) return "gcp-compute-engine";
    if (resourceType.includes("sql_")) return "gcp-cloud-sql";
    if (resourceType.includes("storage_")) return "gcp-cloud-storage";
    if (resourceType.includes("cloudfunctions")) return "gcp-cloud-functions";
    return "google-cloud";
  }

  if (provider === "azurerm" || provider === "azuread" || provider === "azapi") {
    return "microsoft-azure";
  }

  if (provider === "kubernetes" || provider === "helm" || provider === "kubectl") {
    return "kubernetes";
  }

  return null;
}

interface CloudIconProps {
  slug: string;
  title?: string;
  className?: string;
}

export function CloudIcon({ slug, title, className }: CloudIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${ICON_BASE}/${slug}.svg`}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      title={title}
      className={cn("size-4 shrink-0 object-contain", className)}
      loading="lazy"
      decoding="async"
    />
  );
}

interface CloudServiceIconProps {
  provider: string;
  service?: string;
  className?: string;
  title?: string;
}

export function CloudServiceIcon({
  provider,
  service,
  className,
  title,
}: CloudServiceIconProps) {
  const slug = resolveCloudIconSlug(provider, service);
  if (!slug) return null;
  return (
    <CloudIcon
      slug={slug}
      className={className}
      title={title ?? (service ? `${provider} ${service}` : provider)}
    />
  );
}

export function CloudResourceIcon({
  provider,
  service,
  resourceType,
  className,
  title,
}: CloudServiceIconProps & { resourceType?: string }) {
  const slug =
    resolveCloudIconSlug(provider, service) ??
    (resourceType ? resolveCloudIconSlugFromType(resourceType) : null);

  if (!slug) return null;

  return <CloudIcon slug={slug} className={className} title={title} />;
}
