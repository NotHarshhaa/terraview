# Contributing to Terraview

Thanks for your interest in Terraview. This is an early-stage project; the
core engine and the backend adapters are the highest-leverage areas to work on.

## Dev loop

```bash
# Clone + Go deps
git clone https://github.com/NotHarshhaa/terraview
cd terraview

# 1. Start the API against the bundled sample project.
go run ./cmd/terraview serve ./testdata/sample-project --no-ui

# 2. In a second terminal, start the UI in dev mode.
cd ui
npm install
NEXT_PUBLIC_TERRAVIEW_API=http://localhost:7777 npm run dev
#  → http://localhost:3000
```

For an end-to-end production check:

```bash
make build        # builds the Go binary into ./bin/terraview
make ui-build     # builds the Next.js dashboard into ui/.next
./bin/terraview serve ./testdata/sample-project --ui ./ui
```

## Tests

```bash
go test ./...            # engine + classifier + categorizer
npm --prefix ui run typecheck
npm --prefix ui run lint
```

If you change the classifier, the categorizer or the sample project, refresh
the README screenshot expectations in `testdata/sample-project/README.md`.

## High-impact contribution areas

- **Backend adapters** — Azure Blob, Consul, Postgres. Each lives in
  `internal/backend/<name>.go` and only needs to implement the `Backend`
  interface defined in `backend.go`.
- **Provider category mappings** — `internal/engine/categorizer.go` is a flat
  switch; add a few cases and a few tests in `engine_test.go`.
- **Drift detection** — the classifier already understands a `Drifted` state.
  Plug in a comparator that diffs `state.Attributes` against fresh provider
  reads.
- **UI** — resource detail drawer, dependency-graph view, per-module rollups.

## Code style

- Go: standard `gofmt`. Prefer doc-comments on every exported symbol; use
  `//` line comments inline to explain *why*, not *what*.
- TypeScript: Prettier config in `ui/`. Components are kebab-cased file names
  with PascalCase exports.
- No commented-out code. If it might come back, it goes into a tracked issue.
- Keep the dependency footprint small — pull in a library only if you can't
  ship the feature in a couple hundred lines of standard library.

## Releasing

`v0.x` releases are tag-driven: push `vX.Y.Z` and the release workflow builds
and publishes the binary and the container image. Don't bump the version in
code (`main.go` carries a `version = "dev"` default that's overridden via
`-ldflags`).
