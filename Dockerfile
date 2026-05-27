# Multi-stage build for a single self-contained Terraview image.
# 1. ui builder: static Next.js export → /ui/out
# 2. go builder: terraview binary
# 3. runtime: alpine + binary + UI bundle

# -----------------------------------------------------------------------------
# Stage 1: Build the UI (static export for same-origin API in the container)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS ui-builder
WORKDIR /ui

COPY ui/package.json ui/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY ui/ ./
ENV NEXT_OUTPUT=export
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Build the Go binary
# -----------------------------------------------------------------------------
FROM golang:1.25-alpine AS go-builder
WORKDIR /src

RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY cmd/ ./cmd/
COPY internal/ ./internal/

ARG VERSION=dev
ENV CGO_ENABLED=0
RUN go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" \
    -o /out/terraview ./cmd/terraview

# -----------------------------------------------------------------------------
# Stage 3: Runtime
# -----------------------------------------------------------------------------
FROM alpine:3.20 AS runtime

RUN apk add --no-cache ca-certificates tzdata wget && \
    addgroup -S terraview && adduser -S -G terraview terraview

WORKDIR /app

COPY --from=go-builder /out/terraview /usr/local/bin/terraview
COPY --from=ui-builder /ui/out /app/ui/out

USER terraview
EXPOSE 7777
ENV TV_PORT=7777 \
    TV_WORKING_DIR=/workspace \
    TV_POLL_INTERVAL=30s

# Bind /workspace to your Terraform project at runtime:
#   docker run -p 7777:7777 -v $(pwd):/workspace ghcr.io/notharshhaa/terraview:latest
VOLUME ["/workspace"]

ENTRYPOINT ["terraview"]
CMD ["serve", "/workspace", "--ui", "/app/ui"]
