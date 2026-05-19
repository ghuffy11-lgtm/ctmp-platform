# syntax=docker/dockerfile:1.7
# Multi-stage build for CTMP admin portal (Next.js 15).

FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web-admin/package.json apps/web-admin/
COPY packages packages/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web-admin/node_modules ./apps/web-admin/node_modules
COPY . .
WORKDIR /repo/apps/web-admin
RUN pnpm exec next build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/packages /app/packages
COPY --from=build /repo/apps/web-admin/node_modules /app/apps/web-admin/node_modules
COPY --from=build /repo/apps/web-admin/.next /app/apps/web-admin/.next
COPY --from=build /repo/apps/web-admin/public /app/apps/web-admin/public
COPY --from=build /repo/apps/web-admin/package.json /app/apps/web-admin/package.json
COPY --from=build /repo/apps/web-admin/next.config.ts /app/apps/web-admin/next.config.ts
WORKDIR /app/apps/web-admin
EXPOSE 4200
CMD ["./node_modules/.bin/next", "start", "--port", "4200"]
