# syntax=docker/dockerfile:1.7
# Multi-stage build for CTMP vendor portal (Next.js 15).

FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web-vendor/package.json apps/web-vendor/
COPY packages packages/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web-vendor/node_modules ./apps/web-vendor/node_modules
COPY . .
WORKDIR /repo/apps/web-vendor
RUN pnpm exec next build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/web-vendor/.next ./.next
COPY --from=build /repo/apps/web-vendor/public ./public
COPY --from=build /repo/apps/web-vendor/package.json ./package.json
COPY --from=build /repo/apps/web-vendor/node_modules ./node_modules
COPY --from=build /repo/apps/web-vendor/next.config.ts ./next.config.ts
EXPOSE 4300
CMD ["pnpm", "start"]
