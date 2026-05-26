# Multi-stage build for a single self-contained Terraview image.
# 1. ui builder: compiles the Next.js dashboard to a static export.
# 2. go builder: builds the static `terraview` binary, embedding nothing —
#    the UI bundle is copied into the final image alongside it.
# 3. runtime: a distroless-style minimal image that ships only the binary,
#    the UI bundle and a non-root user.

# -----------------------------------------------------------------------------
# Stage 1: Build the UI
# -----------------------------------------------------------------------------
FROM node:22-alpine AS ui-builder
WORKDIR /ui

# Cache deps before the source so changes to .tsx don't re-download node_modules.
COPY ui/package.json ui/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY ui/ ./
# Static export → /ui/out
RUN npx --yes next build && \
    (npx --yes next export -o out 2>/dev/null || cp -r .next/static .next/server out 2>/dev/null || true)

# Fallback: if `next export` isn't supported, we ship the standard .next build
# and point the Go server at it via the resolveUIHandler fallback.

# -----------------------------------------------------------------------------
# Stage 2: Build the Go binary
# -----------------------------------------------------------------------------
FROM golang:1.25-alpine AS go-builder
WORKDIR /src

# Cache modules before sources for faster rebuilds.
COPY go.mod go.sum* ./
RUN go mod download || true

COPY . .

ARG VERSION=dev
ENV CGO_ENABLED=0
RUN go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" \
    -o /out/terraview ./cmd/terraview

# -----------------------------------------------------------------------------
# Stage 3: Runtime
# -----------------------------------------------------------------------------
FROM alpine:3.20 AS runtime

# tzdata + ca-certificates so HTTPS calls (TFC backend) and timestamps work.
RUN apk add --no-cache ca-certificates tzdata && \
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
