<div align="center">

```
████████╗███████╗██████╗ ██████╗  █████╗ ██╗   ██╗██╗███████╗██╗    ██╗
╚══██╔══╝██╔════╝██╔══██╗██╔══██╗██╔══██╗██║   ██║██║██╔════╝██║    ██║
   ██║   █████╗  ██████╔╝██████╔╝███████║██║   ██║██║█████╗  ██║ █╗ ██║
   ██║   ██╔══╝  ██╔══██╗██╔══██╗██╔══██║╚██╗ ██╔╝██║██╔══╝  ██║███╗██║
   ██║   ███████╗██║  ██║██║  ██║██║  ██║ ╚████╔╝ ██║███████╗╚███╔███╔╝
   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝ ╚══╝╚══╝
```

**A self-hostable, git-native Web UI for Terraform resource status.**  
Drop into any repo. No SaaS. No config. Just run and see.

[![Go Version](https://img.shields.io/badge/go-1.22+-00ADD8?style=flat-square&logo=go)](https://golang.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-orange?style=flat-square)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

</div>

---

## What is Terraview?

Most Terraform tooling is either CLI-only or locked behind enterprise SaaS. **Terraview** fills the gap: a lightweight, open-source web dashboard you drop into any Terraform project. It parses your `.tf` files and state backend, then renders every resource in a live status grid — categorized by provider and service type, color-coded by lifecycle status.

```
┌─────────────────────────────────────────────────────────────────┐
│  ✅ 47 created   🔄 3 pending   ⚠️ 2 inactive   ❓ 1 drifted  │
├─────────────────────────────────────────────────────────────────┤
│  AWS › Compute                                                  │
│  aws_instance.web_server     ✅ created   t3.medium            │
│  aws_instance.bastion        ⚠️ stopped   t2.micro             │
│                                                                 │
│  AWS › Networking                                               │
│  aws_vpc.main                ✅ created                        │
│  aws_subnet.private_a        ✅ created                        │
│  aws_security_group.alb      🔄 pending create                 │
│                                                                 │
│  AWS › Databases                                                │
│  aws_rds_instance.postgres   ✅ created   db.t3.med            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why Terraview?

| Pain | Terraview's answer |
|---|---|
| `terraform state list` dumps a flat wall of text | Visual grid, grouped by provider + service category |
| Existing GUI tools are SaaS or enterprise-only | Self-hosted binary, runs locally or in CI |
| No way to see pending vs active at a glance | Six distinct lifecycle statuses, color-coded |
| State drift is invisible until `terraform plan` | Drift detection built into the status engine |
| Hard to share infra status with non-engineers | Shareable URL, no Terraform CLI knowledge needed |

---

## Features

- **Zero-config autodiscovery** — points at any directory and finds `.tf` files automatically
- **Multi-backend state reading** — local, S3 + DynamoDB, GCS, Azure Blob, Terraform Cloud API
- **Six resource lifecycle statuses** — created, inactive, pending create, pending destroy, pending update, drifted
- **Auto-categorization** — groups resources by provider (AWS, GCP, Azure, k8s) then service type (Compute, Network, Database, Storage, IAM, etc.)
- **Live polling** — re-reads state every 30 seconds, no page refresh needed
- **Module-aware** — shows which module each resource belongs to
- **Filter + search** — filter by provider, status, module, tag, or free-text search
- **Cost estimates** — optional Infracost integration for per-resource cost column
- **GitHub Actions mode** — outputs a status table as a PR comment

---

## Quick Start

### Binary

```bash
# Install
go install github.com/NotHarshhaa/terraview@latest

# Run in your Terraform project root
cd /path/to/your/terraform/project
terraview serve .

# Opens http://localhost:7777
```

### Docker

```bash
docker run -p 7777:7777 \
  -v $(pwd):/workspace \
  ghcr.io/notharshhaa/terraview:latest
```

### Docker Compose (add to existing project)

```yaml
# docker-compose.yml
services:
  terraview:
    image: ghcr.io/notharshhaa/terraview:latest
    ports:
      - "7777:7777"
    volumes:
      - .:/workspace
    environment:
      - TV_BACKEND=s3                       # local | s3 | gcs | azureblob | tfc
      - TV_STATE_BUCKET=my-terraform-state  # for S3/GCS
      - TV_POLL_INTERVAL=30s
```

### GitHub Actions (PR status comment)

```yaml
# .github/workflows/terraview.yml
name: Terraform Status
on: [pull_request]

jobs:
  status:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: NotHarshhaa/terraview-action@v1
        with:
          working-directory: ./infra
          backend: s3
          state-bucket: ${{ secrets.TF_STATE_BUCKET }}
          aws-region: us-east-1
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

This posts a status table directly on the PR:

```
## 🔭 Terraview — Infrastructure Status

| Resource | Type | Module | Status | Last Changed |
|---|---|---|---|---|
| web_server | aws_instance | //compute | ✅ created | 2d ago |
| alb_sg | aws_security_group | //networking | 🔄 pending create | — |
| postgres | aws_rds_instance | //databases | ✅ created | 5d ago |
```

---

## Architecture

```
Your Terraform Repo
├── main.tf  vpc.tf  rds.tf  modules/
└── .terraview/          ← Terraview lives here

          │  reads .tf files + state
          ▼

┌──────────────────────────────────────┐
│          TERRAVIEW ENGINE (Go)        │
│                                      │
│  HCL Parser  │  State Parser  │  Plan Parser   │
│              ↓                ↓                 │
│       Status Classifier  +  Category Engine    │
│              ↓                                  │
│  Backend Adapters:                             │
│  Local │ S3+DynamoDB │ GCS │ AzureBlob │ TFC  │
└──────────────────────────────────────┘
          │  JSON resource graph
          ▼

┌──────────────────────────────────────┐
│       TERRAVIEW WEB UI (Next.js)      │
│  port 7777                           │
│                                      │
│  Summary Bar  │  Filter Sidebar  │  Live Polling  │
│                                      │
│  Resource Status Grid                │
│  Provider → Category → Resource rows │
└──────────────────────────────────────┘
```

### Status Classification Logic

Each resource goes through this decision tree:

```
Is the resource in the state file?
├── NO  → Is it in the plan with action=create?
│          ├── YES → 🔄 Pending Create
│          └── NO  → ⬜ Not Managed
│
└── YES → Does state match actual provider attributes?
           ├── NO  → ❓ Drifted
           └── YES → What is the provider-reported status?
                      ├── running/available/active → ✅ Created & Active
                      ├── stopped/disabled/paused  → ⚠️ Inactive
                      └── Is it in plan with action=delete? → 🗑 Pending Destroy
                          Is it in plan with action=update? → 🔀 Pending Update
```

### Category Engine Mapping

```
aws_instance, aws_autoscaling_*       → AWS › Compute
aws_vpc, aws_subnet, aws_route_*      → AWS › Networking
aws_security_group, aws_nacl          → AWS › Networking
aws_rds_*, aws_dynamodb_*             → AWS › Databases
aws_elasticache_*                     → AWS › Databases
aws_s3_bucket, aws_efs_*              → AWS › Storage
aws_iam_*, aws_kms_*                  → AWS › Security & IAM
aws_lambda_*, aws_sqs_*, aws_sns_*    → AWS › Serverless
aws_eks_*, aws_ecs_*                  → AWS › Containers
aws_alb, aws_lb, aws_cloudfront_*     → AWS › Load Balancing & CDN

google_compute_*                      → GCP › Compute
google_sql_*, google_bigtable_*       → GCP › Databases
google_storage_*                      → GCP › Storage
google_container_*                    → GCP › Kubernetes

azurerm_virtual_machine_*             → Azure › Compute
azurerm_sql_*, azurerm_cosmosdb_*     → Azure › Databases
azurerm_storage_*                     → Azure › Storage
azurerm_virtual_network_*             → Azure › Networking

kubernetes_deployment, kubernetes_pod → Kubernetes › Workloads
kubernetes_service, kubernetes_ingress → Kubernetes › Networking
kubernetes_persistent_volume_*        → Kubernetes › Storage
```

---

## Configuration

Terraview uses zero config by default. Optional configuration via `.terraview.yaml` in your project root or environment variables:

```yaml
# .terraview.yaml
port: 7777
poll_interval: 30s
working_dir: .

backend:
  type: s3                          # local | s3 | gcs | azureblob | tfc
  bucket: my-terraform-state        # S3/GCS bucket name
  key: terraform/project/terraform.tfstate
  region: us-east-1
  dynamodb_table: terraform-locks   # optional

ui:
  title: "My Project — Infrastructure"
  show_cost_column: true            # requires INFRACOST_API_KEY
  default_filter: status=created

auth:
  enabled: false                    # optional basic auth
  username: admin
  password_env: TV_PASSWORD
```

| Env Var | Default | Description |
|---|---|---|
| `TV_PORT` | `7777` | Web UI port |
| `TV_BACKEND` | `local` | State backend type |
| `TV_STATE_BUCKET` | — | S3/GCS bucket name |
| `TV_POLL_INTERVAL` | `30s` | State refresh interval |
| `TV_WORKING_DIR` | `.` | Path to Terraform root |
| `INFRACOST_API_KEY` | — | Enables cost column |

---

## Supported Backends

| Backend | Status | Notes |
|---|---|---|
| Local (`terraform.tfstate`) | ✅ Supported | Default, no config needed |
| S3 + DynamoDB | ✅ Supported | Uses standard AWS SDK credential chain |
| GCS | ✅ Supported | Uses ADC or `GOOGLE_APPLICATION_CREDENTIALS` |
| Azure Blob Storage | 🚧 In progress | |
| Terraform Cloud / HCP | 🚧 In progress | Needs `TFE_TOKEN` |
| Consul | 📋 Planned | |
| Postgres | 📋 Planned | |

---

## Roadmap

- [ ] `v0.1` — Core engine + local backend + basic status grid
- [ ] `v0.2` — S3 + GCS backend adapters
- [ ] `v0.3` — Drift detection via provider attribute comparison
- [ ] `v0.4` — GitHub Actions mode + PR comments
- [ ] `v0.5` — Infracost integration (cost column)
- [ ] `v0.6` — Terraform Cloud backend + multi-workspace support
- [ ] `v1.0` — Stable API, Helm chart for in-cluster deployment
- [ ] `v1.x` — RBAC, SSO, team sharing features

---

## Project Structure

```
terraview/
├── cmd/
│   └── terraview/
│       └── main.go              # CLI entrypoint (serve, version)
│
├── internal/
│   ├── engine/
│   │   ├── hcl_parser.go        # Reads .tf files into resource AST
│   │   ├── state_parser.go      # Parses terraform show -json output
│   │   ├── plan_parser.go       # Parses terraform plan -json output
│   │   ├── classifier.go        # Status classification logic
│   │   └── categorizer.go       # resource_type → provider/service mapping
│   │
│   ├── backend/
│   │   ├── backend.go           # Backend interface
│   │   ├── local.go             # Local tfstate reader
│   │   ├── s3.go                # S3 + DynamoDB reader
│   │   ├── gcs.go               # GCS reader
│   │   └── tfc.go               # Terraform Cloud API client
│   │
│   ├── api/
│   │   ├── server.go            # HTTP server + routes
│   │   ├── handlers.go          # /api/resources, /api/summary, /api/status
│   │   └── poller.go            # Background state refresh goroutine
│   │
│   └── models/
│       └── resource.go          # Resource, Status, Category types
│
├── ui/                          # Next.js frontend
│   ├── app/
│   │   └── page.tsx             # Main dashboard
│   ├── components/
│   │   ├── ResourceGrid.tsx     # Main status table
│   │   ├── SummaryBar.tsx       # Status counts header
│   │   ├── FilterSidebar.tsx    # Provider / module / tag filters
│   │   └── StatusBadge.tsx      # Color-coded status pills
│   └── lib/
│       └── api.ts               # SWR hooks for /api/* endpoints
│
├── Dockerfile
├── docker-compose.yml
├── .terraview.yaml.example
└── README.md
```

---

## Contributing

Contributions are welcome. This is an early-stage project and the core engine is the most impactful area to contribute to.

**High-value contribution areas:**
- Backend adapters (Azure Blob, Consul, Postgres)
- Provider category mappings (GCP, Azure, k8s resources)
- Drift detection improvement (attribute-level comparison)
- UI improvements (resource detail drawer, graph view)

```bash
# Development setup
git clone https://github.com/NotHarshhaa/terraview
cd terraview

# Run backend
go run ./cmd/terraview serve ./testdata/sample-project

# Run frontend (separate terminal)
cd ui && npm install && npm run dev

# Run tests
go test ./...
```

---

## Related Projects

Built by the same author — part of the open-source DevOps tooling ecosystem:

- [`devops-project-generator`](https://github.com/NotHarshhaa/devops-project-generator) — scaffold DevOps project structures
- [`terraform-cost-estimator`](https://github.com/NotHarshhaa/terraform-cost-estimator) — cost estimation for Terraform plans
- [`jenkins-plus`](https://github.com/NotHarshhaa/jenkins-plus) — batteries-included Jenkins with modern UI

---

## License

Apache 2.0 — see [LICENSE](LICENSE)

---

<div align="center">
Built by <a href="https://github.com/NotHarshhaa">@NotHarshhaa</a> · Always Building
</div>
