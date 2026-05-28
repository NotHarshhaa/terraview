# sample-project

Tiny fake Terraform project used to drive the Terraview demo. Nothing here
talks to a real cloud — the providers are never initialised and the
`terraform.tfstate` next to the `.tf` files is hand-crafted.

```bash
# From the repository root:
go run ./cmd/terraview serve ./testdata/sample-project
# → http://localhost:7777

# UI dev mode:
go run ./cmd/terraview serve ./testdata/sample-project --no-ui
cd ui && npm run dev
```

## Providers covered

| Provider | `.tf` file | Example resources |
|---|---|---|
| **AWS** | `main.tf` | VPC, EC2, RDS, S3, IAM, Lambda |
| **GCP** | `gcp.tf` | VPC, GCE, Cloud Storage, Cloud SQL, service account |
| **Azure** | `azure.tf` | Resource group, VNet, VM, storage, PostgreSQL |
| **Kubernetes** | `kubernetes.tf` | Namespace, Deployment, Service |
| **Cloudflare** | `cloudflare.tf` | Zone (+ unmanaged DNS record) |

Workspaces under `terraform.tfstate.d/` vary the mix so you can exercise the
workspace switcher:

| Workspace | What's in state |
|---|---|
| `default` | All providers (full demo) |
| `dev` | AWS + GCP |
| `staging` | Partial AWS + Azure + Kubernetes |

## Status mix (default workspace)

The state files deliberately contain a mix of statuses and tags so you can
exercise filters, tag grouping, provider breakdown, and the dependency graph:

| Resource | Expected status |
|---|---|
| `aws_vpc.main` | ✅ created |
| `aws_subnet.private_a` | ✅ created |
| `aws_security_group.alb` | ⬜ unmanaged (declared in .tf, not in state) |
| `aws_instance.web_server` | ✅ created |
| `aws_instance.bastion` | ⚠️ inactive (`instance_state=stopped`) |
| `aws_rds_instance.postgres` | ✅ created |
| `aws_s3_bucket.assets` | ✅ created |
| `aws_iam_role.ec2` | ✅ created |
| `aws_lambda_function.image_resize` | ✅ created |
| `google_compute_network.main` | ✅ created |
| `google_compute_instance.app` | ✅ created |
| `google_storage_bucket.data` | ✅ created |
| `azurerm_linux_virtual_machine.web` | ⚠️ inactive (`power_state=stopped`) |
| `kubernetes_deployment.api` | ✅ created |
| `cloudflare_zone.main` | ✅ created |
| `cloudflare_record.www` | ⬜ unmanaged |

Tags / labels include `Environment`, `Team`, and `Owner` on several resources
so **By tag** grouping in the grid has meaningful keys to pick from.
