# MK AI Command Center — production image
# Builds the web app and ships a runtime image that can run either the web server
# (default) or the 24/7 worker via docker-compose.

FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ---- deps ----
FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ apps/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
RUN pnpm --filter @mkcc/web build

# ---- runtime ----
FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# Runtime needs the workspace sources (tsx runs worker from TS) plus installed deps.
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages
COPY --from=deps /repo/apps ./apps
COPY --from=build /repo/apps/web/.next ./apps/web/.next
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./

RUN mkdir -p /repo/data

EXPOSE 3100
CMD ["pnpm", "--filter", "@mkcc/web", "start"]
