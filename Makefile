## Terraview developer makefile. Targets are POSIX-friendly; on Windows use
## Git Bash or run the underlying commands directly.

GO        ?= go
NPM       ?= npm
VERSION   ?= dev
BIN_DIR   ?= bin
BINARY    ?= $(BIN_DIR)/terraview
LDFLAGS    = -s -w -X main.version=$(VERSION)

.PHONY: help build run test vet fmt ui-install ui-dev ui-build clean docker

help:
	@echo "Terraview — common targets"
	@echo ""
	@echo "  make build       Build the terraview binary into $(BINARY)"
	@echo "  make run         Run terraview against ./testdata/sample-project"
	@echo "  make test        go test ./..."
	@echo "  make vet         go vet ./..."
	@echo "  make fmt         gofmt -s -w ."
	@echo ""
	@echo "  make ui-install  npm install in ui/"
	@echo "  make ui-dev      Next.js dev server on :3000 (point at :7777)"
	@echo "  make ui-build    Production Next.js build (ui/.next)"
	@echo ""
	@echo "  make docker      Build the multi-stage container image"
	@echo "  make clean       Remove build artefacts"

build:
	@mkdir -p $(BIN_DIR)
	$(GO) build -trimpath -ldflags "$(LDFLAGS)" -o $(BINARY) ./cmd/terraview

run: build
	$(BINARY) serve ./testdata/sample-project

test:
	$(GO) test ./...

vet:
	$(GO) vet ./...

fmt:
	gofmt -s -w .

ui-install:
	cd ui && $(NPM) install

ui-dev:
	cd ui && NEXT_PUBLIC_TERRAVIEW_API=http://localhost:7777 $(NPM) run dev

ui-build:
	cd ui && $(NPM) run build

docker:
	docker build --build-arg VERSION=$(VERSION) -t terraview:$(VERSION) .

clean:
	rm -rf $(BIN_DIR) ui/.next ui/out
