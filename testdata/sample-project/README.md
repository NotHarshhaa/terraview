# sample-project

Tiny fake Terraform project used to drive the Terraview demo. Nothing here
talks to a real cloud — the providers are never initialised and the
`terraform.tfstate` next to `main.tf` is hand-crafted.

```bash
# From the repository root:
go run ./cmd/terraview serve ./testdata/sample-project
# → http://localhost:7777
```

The state file deliberately contains a mix of statuses so you can see all the
classifier outputs in action:

| Resource | Expected status |
|---|---|
| `aws_vpc.main` | ✅ created |
| `aws_subnet.private_a` | ✅ created |
| `aws_security_group.alb` | ⬜ unmanaged (declared in .tf, not in state) |
| `aws_instance.web_server` | ✅ created |
| `aws_instance.bastion` | ⚠️ inactive (instance_state=stopped) |
| `aws_rds_instance.postgres` | ✅ created |
| `aws_s3_bucket.assets` | ✅ created |
| `aws_iam_role.ec2` | ✅ created |
| `aws_lambda_function.image_resize` | ✅ created |
