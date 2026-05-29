# ---- Build stage: compile the godex binary ----
# Use the build host platform for cross-compilation via bun --target
FROM --platform=$BUILDPLATFORM oven/bun:1.3.14 AS build

ARG TARGETARCH

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and compile
COPY src/ src/
COPY tsconfig.json ./
# Map TARGETARCH to bun compile target
RUN BUN_TARGET="bun-linux-$(echo ${TARGETARCH} | sed 's/amd64/x64/;s/arm64/arm64/')" && \
    echo "Building for ${BUN_TARGET}" && \
    bun build --compile \
    --define GODEX_BUILD_ENV=\"prod\" \
    --target="${BUN_TARGET}" \
    src/index.ts \
    --outfile /app/godex

# ---- Runtime stage: minimal image with the binary ----
FROM debian:bookworm-slim AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /app/godex /usr/local/bin/godex
RUN chmod +x /usr/local/bin/godex

# Default data directory for sessions.db / trace.db
RUN mkdir -p /data
VOLUME /data

# Default config directory
RUN mkdir -p /etc/godex
VOLUME /etc/godex

ENV GODEX_PORT=5678
EXPOSE 5678

ENTRYPOINT ["godex"]
CMD ["serve", "--config", "/etc/godex/godex.yaml"]
