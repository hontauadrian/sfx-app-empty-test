FROM node:24-alpine AS base
# Install bash so the repo's `postinstall` hook (`bash scripts/worktree-stack.sh
# refresh-watch-if-running` in the workspace package.json) does not abort
# `pnpm install --frozen-lockfile` with `sh: bash: not found` inside Alpine.
RUN apk add --no-cache bash
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
COPY packages/shared/package.json packages/shared/
COPY packages/validation/package.json packages/validation/
COPY packages/database/package.json packages/database/
COPY packages/database/prisma/schema.prisma packages/database/prisma/
# `--ignore-scripts` skips the workspace `postinstall` hook
# (`bash scripts/worktree-stack.sh refresh-watch-if-running`) which references
# a script that has not been COPYed yet — the deps stage only ships
# package.json files for layer-cache friendliness. The hook only refreshes a
# host-side dev watcher and is meaningless inside a container build, so
# skipping it is safe and lets `pnpm install --frozen-lockfile` succeed.
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @sfx/database prisma generate

# --- Development ---
FROM deps AS development
COPY . .
# Packages use "main": "./dist/index.js"; pnpm install does not compile them. Nest resolves
# workspace deps from dist at runtime.
RUN pnpm --filter @sfx/domain build && \
    pnpm --filter @sfx/shared build && \
    pnpm --filter @sfx/validation build && \
    pnpm --filter @sfx/database build
WORKDIR /app/apps/api
CMD ["pnpm", "dev"]

# --- Build ---
FROM deps AS build
COPY . .
RUN pnpm --filter @sfx/api build

# --- Production ---
FROM node:24-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/database/prisma ./prisma

EXPOSE 3001
# Pin prisma to the version declared in @sfx/database. Bare `npx prisma` resolves
# the LATEST published version (currently 7.x), which dropped the `datasource { url
# = env(...) }` syntax our schema uses and crashes the api container with
# `Error: Prisma schema validation - The datasource property url is no longer supported`.
# The trailing `@${PRISMA_VERSION}` keeps us pinned to a v6 release that matches
# both `@prisma/client` and the generated client copied from the build stage.
ENV PRISMA_VERSION=6.3.0
CMD ["sh", "-c", "npx prisma@${PRISMA_VERSION} migrate deploy --schema ./prisma/schema.prisma && node dist/main.js"]
