# Cloud service icons (thesvg)

Official AWS, GCP, and Azure architecture icons from [thesvg](https://thesvg.com).

## Add icons

```bash
cd ui

# Single icon
npx @thesvg/cli add aws-aws-fargate --format svg --dir ./public/icons/cloud

# Multiple at once
npx @thesvg/cli add gcp-compute-engine azure-app-services aws-amazon-ec2 \
  --format svg --dir ./public/icons/cloud
```

Then wire the slug in `lib/cloud-icons.tsx` (service → slug mapping).

## Search available icons

```bash
npx @thesvg/cli search ec2
npx @thesvg/cli search compute-engine
npx @thesvg/cli list
```
