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
# Skip puppeteer's bundled chromium download — runtime uses the system
# chromium from alpine packages (much smaller than puppeteer's bundle).
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
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
# Phase E (BUG-038): puppeteer-core uses system chromium for Award Minutes
# PDF generation. The font packages are required so generated PDFs render
# Latin/Arabic glyphs correctly.
RUN apk add --no-cache \
    wget \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto \
    font-noto-arabic
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/packages /app/packages
COPY --from=build /repo/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build /repo/apps/api/dist /app/apps/api/dist
COPY --from=build /repo/apps/api/package.json /app/apps/api/package.json
COPY --from=build /repo/apps/api/prisma /app/apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
