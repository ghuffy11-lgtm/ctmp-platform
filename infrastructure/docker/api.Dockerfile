# syntax=docker/dockerfile:1.7
# Multi-stage build for CTMP API (NestJS + Prisma).

FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages packages/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY . .
WORKDIR /repo/apps/api
RUN pnpm exec prisma generate
RUN pnpm exec nest build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache wget
COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/packages /app/packages
COPY --from=build /repo/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build /repo/apps/api/dist /app/apps/api/dist
COPY --from=build /repo/apps/api/package.json /app/apps/api/package.json
COPY --from=build /repo/apps/api/prisma /app/apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
