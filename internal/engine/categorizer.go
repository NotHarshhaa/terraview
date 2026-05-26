// Package engine contains the pure logic that converts Terraform inputs
// (HCL files, state JSON, plan JSON) into a Terraview Snapshot.
package engine

import (
	"strings"

	"github.com/NotHarshhaa/terraview/internal/models"
)

// Categorize maps a Terraform resource type (e.g. "aws_instance") to its
// (provider, service-family) tuple. The mapping is intentionally simple and
// keyword-based so it stays maintainable and matches the table in the README.
//
// Unknown providers fall back to ("Other", "Other"); unknown resource types
// within a known provider fall back to ("<provider>", "Other") so they still
// render in a useful section in the UI.
func Categorize(resourceType string) models.Category {
	provider := providerFromType(resourceType)
	suffix := strings.TrimPrefix(resourceType, provider+"_")

	switch provider {
	case "aws":
		return models.Category{Provider: "AWS", Service: awsService(suffix)}
	case "google":
		return models.Category{Provider: "GCP", Service: gcpService(suffix)}
	case "azurerm", "azapi", "azuread":
		return models.Category{Provider: "Azure", Service: azureService(suffix)}
	case "kubernetes", "kubectl", "helm":
		return models.Category{Provider: "Kubernetes", Service: kubernetesService(suffix)}
	case "datadog", "newrelic", "grafana", "pagerduty":
		return models.Category{Provider: titleCase(provider), Service: "Observability"}
	case "github", "gitlab", "bitbucket":
		return models.Category{Provider: titleCase(provider), Service: "VCS"}
	case "cloudflare", "fastly":
		return models.Category{Provider: titleCase(provider), Service: "CDN & DNS"}
	default:
		if provider == "" {
			return models.Category{Provider: "Other", Service: "Other"}
		}
		return models.Category{Provider: titleCase(provider), Service: "Other"}
	}
}

// providerFromType derives the provider prefix from a resource type. The
// Terraform convention is "<provider>_<the_rest>", so the first underscore is
// the boundary.
func providerFromType(resourceType string) string {
	if i := strings.Index(resourceType, "_"); i > 0 {
		return resourceType[:i]
	}
	return resourceType
}

// awsService picks an AWS service family from the post-"aws_" suffix. The
// rules follow the README's category engine mapping. Order matters: we test
// more-specific prefixes first.
func awsService(suffix string) string {
	switch {
	case hasAny(suffix, "instance", "autoscaling_", "launch_template", "launch_configuration", "ec2_", "ami", "key_pair", "placement_group"):
		return "Compute"
	case hasAny(suffix, "lambda_", "sqs_", "sns_", "stepfunctions_", "step_functions_", "eventbridge_", "events_"):
		return "Serverless"
	case hasAny(suffix, "eks_", "ecs_", "ecr_", "fargate_"):
		return "Containers"
	case hasAny(suffix, "rds_", "dynamodb_", "elasticache_", "neptune_", "docdb_", "redshift_", "timestreamwrite_", "memorydb_"):
		return "Databases"
	case hasAny(suffix, "s3_", "efs_", "fsx_", "backup_", "glacier_"):
		return "Storage"
	case hasAny(suffix, "iam_", "kms_", "secretsmanager_", "ssm_", "acm", "waf_", "shield_", "guardduty_", "securityhub_", "config_"):
		return "Security & IAM"
	case hasAny(suffix, "alb", "lb", "cloudfront_", "globalaccelerator_", "apigateway", "apigatewayv2"):
		return "Load Balancing & CDN"
	case hasAny(suffix, "vpc", "subnet", "route_", "internet_gateway", "nat_gateway", "vpn_", "transit_gateway", "network_", "nacl", "security_group", "vpc_endpoint"):
		return "Networking"
	case hasAny(suffix, "cloudwatch_", "logs_", "xray_"):
		return "Observability"
	case hasAny(suffix, "kinesis_", "msk_", "glue_", "athena_", "emr_", "lakeformation_"):
		return "Analytics & Streaming"
	default:
		return "Other"
	}
}

func gcpService(suffix string) string {
	switch {
	case hasAny(suffix, "compute_instance", "compute_disk", "compute_image", "compute_address", "compute_template"):
		return "Compute"
	case hasAny(suffix, "compute_network", "compute_subnetwork", "compute_router", "compute_firewall", "compute_route"):
		return "Networking"
	case hasAny(suffix, "sql_", "bigtable_", "spanner_", "firestore_", "redis_"):
		return "Databases"
	case hasAny(suffix, "storage_"):
		return "Storage"
	case hasAny(suffix, "container_", "gke_"):
		return "Kubernetes"
	case hasAny(suffix, "iam_", "kms_", "secret_manager_"):
		return "Security & IAM"
	case hasAny(suffix, "cloudfunctions_", "cloud_run_", "pubsub_"):
		return "Serverless"
	case hasAny(suffix, "logging_", "monitoring_"):
		return "Observability"
	default:
		return "Other"
	}
}

func azureService(suffix string) string {
	switch {
	case hasAny(suffix, "virtual_machine", "linux_virtual_machine", "windows_virtual_machine", "availability_set", "vmss"):
		return "Compute"
	case hasAny(suffix, "sql_", "mysql_", "postgresql_", "cosmosdb_", "redis_"):
		return "Databases"
	case hasAny(suffix, "storage_"):
		return "Storage"
	case hasAny(suffix, "virtual_network", "subnet", "network_security_group", "public_ip", "lb", "application_gateway"):
		return "Networking"
	case hasAny(suffix, "kubernetes_cluster", "container_"):
		return "Kubernetes"
	case hasAny(suffix, "role_", "key_vault", "user_assigned_identity"):
		return "Security & IAM"
	case hasAny(suffix, "function_app", "logic_app", "eventhub_", "servicebus_"):
		return "Serverless"
	case hasAny(suffix, "log_analytics_", "application_insights", "monitor_"):
		return "Observability"
	default:
		return "Other"
	}
}

func kubernetesService(suffix string) string {
	switch {
	case hasAny(suffix, "deployment", "stateful_set", "daemon_set", "pod", "replication_controller", "job", "cron_job"):
		return "Workloads"
	case hasAny(suffix, "service", "ingress", "endpoints", "network_policy"):
		return "Networking"
	case hasAny(suffix, "persistent_volume", "storage_class"):
		return "Storage"
	case hasAny(suffix, "config_map", "secret"):
		return "Config & Secrets"
	case hasAny(suffix, "role", "cluster_role", "role_binding", "service_account"):
		return "Security & IAM"
	default:
		return "Other"
	}
}

// hasAny returns true if suffix starts with any of the needles, or equals one.
// We match on prefixes because Terraform resource names typically follow
// "aws_rds_instance", "aws_rds_cluster", etc. — they all share a prefix.
func hasAny(suffix string, needles ...string) bool {
	for _, n := range needles {
		if suffix == strings.TrimSuffix(n, "_") || strings.HasPrefix(suffix, n) {
			return true
		}
	}
	return false
}

// titleCase upper-cases the first rune. Used for unknown providers so they
// look passable in the UI ("vault" → "Vault").
func titleCase(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
