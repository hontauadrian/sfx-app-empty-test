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
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/shared/package.json packages/shared/
COPY packages/validation/package.json packages/validation/
# `--ignore-scripts` skips the workspace `postinstall` hook
# (`bash scripts/worktree-stack.sh refresh-watch-if-running`) which references
# a script that has not been COPYed yet — the deps stage only ships
# package.json files for layer-cache friendliness. The hook only refreshes a
# host-side dev watcher and is meaningless inside a container build, so
# skipping it is safe and lets `pnpm install --frozen-lockfile` succeed.
RUN pnpm install --frozen-lockfile --ignore-scripts

# --- Development ---
FROM deps AS development
COPY . .
ARG NEXT_PUBLIC_API_URL
RUN if [ -n "$NEXT_PUBLIC_API_URL" ]; then echo "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL" > /app/apps/web/.env.local; fi
RUN pnpm --filter @sfx/domain build && \
    pnpm --filter @sfx/shared build && \
    pnpm --filter @sfx/validation build
WORKDIR /app/apps/web
CMD ["pnpm", "dev"]

# --- Build ---
FROM deps AS build
COPY . .
RUN pnpm --filter @sfx/web build

# --- Production ---
FROM node:24-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
