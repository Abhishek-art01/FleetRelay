FROM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@11.5.0 --activate
ENV npm_config_user_agent=pnpm/11.5.0
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY artifacts/api-server/package.json artifacts/api-server/tsconfig.json artifacts/api-server/build.mjs ./artifacts/api-server/
COPY lib/api-zod/package.json lib/api-zod/tsconfig.json ./lib/api-zod/
COPY lib/db/package.json lib/db/tsconfig.json ./lib/db/

RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild esbuild

COPY artifacts/api-server ./artifacts/api-server
COPY lib/api-zod ./lib/api-zod
COPY lib/db ./lib/db

RUN pnpm --filter @workspace/api-server build

FROM node:22-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/artifacts/api-server/dist ./dist

EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
