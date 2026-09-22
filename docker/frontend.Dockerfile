FROM node:22-slim AS build

ARG APP_DIR
ARG APP_DIR_NAME
ARG APP_NAME
ARG PORT
ARG BASE_PATH=/
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

RUN corepack enable && corepack prepare pnpm@11.5.0 --activate
ENV npm_config_user_agent=pnpm/11.5.0
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY artifacts/${APP_DIR_NAME}/package.json artifacts/${APP_DIR_NAME}/tsconfig.json artifacts/${APP_DIR_NAME}/vite.config.ts ./artifacts/${APP_DIR_NAME}/
COPY lib/api-client-react/package.json lib/api-client-react/tsconfig.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/tsconfig.json ./lib/api-zod/

RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild esbuild

COPY artifacts/${APP_DIR_NAME} ./artifacts/${APP_DIR_NAME}
COPY lib/api-client-react ./lib/api-client-react
COPY lib/api-spec ./lib/api-spec
COPY lib/api-zod ./lib/api-zod

ENV NODE_ENV=production
ENV PORT=${PORT}
ENV BASE_PATH=${BASE_PATH}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}

RUN pnpm --filter "${APP_NAME}" build

FROM nginx:1.29-alpine AS runtime

ARG APP_DIR

COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/${APP_DIR}/dist /usr/share/nginx/html

EXPOSE 80
