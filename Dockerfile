# Production-identical build of the Ekhaya FC app, runnable anywhere Docker runs.
#   docker build -t ekhaya-fc-app --build-arg-file .env .   (or pass each VITE_* with --build-arg)
#   docker run -p 8080:8080 ekhaya-fc-app   ->  http://localhost:8080
# Same Node version as GitHub (see .nvmrc) and exact package versions (npm ci).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_VAPID_KEY
ARG VITE_APK_URL
RUN npm run check && npm run build && npm run check:bundle

FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/ | grep -q 'id="root"' || exit 1
