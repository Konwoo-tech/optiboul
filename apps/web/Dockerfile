# Image « web » : l'application React construite, servie par Nginx (spécification §10.2).
# Contexte de construction : apps/web.
FROM docker.io/node:24-alpine AS build
RUN npm install -g pnpm@12.9.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM docker.io/nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY securite.conf /etc/nginx/snippets/securite.conf
COPY --from=build /app/dist /usr/share/nginx/html
