// This placeholder makes `ui/` a separate Go module so that `go test ./...`
// and `go vet ./...` skip stray Go files that occasionally ship inside
// node_modules. The directory itself is the Next.js frontend; no Go code
// lives here.

module github.com/NotHarshhaa/terraview/ui

go 1.22
