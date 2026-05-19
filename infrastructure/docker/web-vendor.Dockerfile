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
COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/packages /app/packages
COPY --from=build /repo/apps/web-vendor/node_modules /app/apps/web-vendor/node_modules
COPY --from=build /repo/apps/web-vendor/.next /app/apps/web-vendor/.next
COPY --from=build /repo/apps/web-vendor/public /app/apps/web-vendor/public
COPY --from=build /repo/apps/web-vendor/package.json /app/apps/web-vendor/package.json
COPY --from=build /repo/apps/web-vendor/next.config.ts /app/apps/web-vendor/next.config.ts
WORKDIR /app/apps/web-vendor
EXPOSE 4300
CMD ["./node_modules/.bin/next", "start", "--port", "4300"]
