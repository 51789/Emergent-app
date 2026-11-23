FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
ENV CI=1 EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1
RUN npm run export:web -- --max-workers 2

FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -q -O /dev/null http://127.0.0.1/manifest.webmanifest || exit 1
