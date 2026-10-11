# Cohérence-Politique — image de production (serveur unique avec base SQLite sur volume persistant)
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
# Image du SITE PUBLIC : lecture seule, aucune administration ni clé Claude.
# La base arrive par `npm run publish` depuis la machine locale (jeton COHERENCE_ADMIN_TOKEN à fournir au conteneur).
ENV NODE_ENV=production COHERENCE_DB_PATH=/data/coherence.db PORT=3000 COHERENCE_PUBLIC=1 COHERENCE_ENGINE=api
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
# Polices des images de partage (/partager/...)
COPY --from=build /app/assets ./assets
COPY --from=build /app/next.config.ts ./
VOLUME ["/data"]
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
