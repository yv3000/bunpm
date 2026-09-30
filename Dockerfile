# Isolated Linux environment for the offline test suite, with the same Node.js
# and Bun versions as CI. It is a development tool, not a way to ship bunpm:
#   docker build -t bunpm-test .
#   docker run --rm bunpm-test
FROM oven/bun:1.3.14 AS bun

FROM node:22.22.2-bookworm-slim
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
WORKDIR /bunpm
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
# Unprivileged, so executable-permission checks behave as they do for users.
USER node
CMD ["bun", "test"]
