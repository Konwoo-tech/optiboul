# Image « web » : les 4 applications React construites ensemble, servies par Nginx (spécification §10.2).
# L'application mobile (apps/mobile/pilotage) est distribuée par les stores / EAS, pas par ce conteneur.
FROM docker.io/node:24-alpine AS build
RUN npm install -g pnpm@12.9.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
      --filter optiboul \
      --filter "@optiboul/portail..." --filter "@optiboul/comptoir..." \
      --filter "@optiboul/atelier..." --filter "@optiboul/gestion..."
RUN pnpm turbo run build \
      --filter @optiboul/portail --filter @optiboul/comptoir \
      --filter @optiboul/atelier --filter @optiboul/gestion

FROM docker.io/nginx:stable-alpine
COPY compose/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/portail/dist /usr/share/nginx/html
COPY --from=build /app/apps/frontend/comptoir/dist /usr/share/nginx/html/comptoir
COPY --from=build /app/apps/frontend/atelier/dist /usr/share/nginx/html/atelier
COPY --from=build /app/apps/frontend/gestion/dist /usr/share/nginx/html/gestion
