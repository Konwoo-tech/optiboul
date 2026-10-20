# Image « web » : l'application web React, servie par Nginx (spécification §10.2).
# L'application mobile (apps/mobile/pilotage) est distribuée par les stores / EAS, pas par ce conteneur.
FROM docker.io/node:24-alpine AS build
RUN npm install -g pnpm@12.9.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter optiboul --filter "@optiboul/web..."
RUN pnpm turbo run build --filter @optiboul/web

FROM docker.io/nginx:stable-alpine
COPY compose/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
