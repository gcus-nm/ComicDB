FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential python3 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/data
ENV BACKUP_DIR=/backups
RUN groupadd --system --gid 1001 comicdb \
  && useradd --system --uid 1001 --gid comicdb comicdb \
  && mkdir -p /data /backups \
  && chown -R comicdb:comicdb /data /backups
COPY --from=builder --chown=comicdb:comicdb /app/public ./public
COPY --from=production-dependencies --chown=comicdb:comicdb /app/node_modules ./node_modules
COPY --from=builder --chown=comicdb:comicdb /app/.next ./.next
COPY --from=builder --chown=comicdb:comicdb /app/package.json ./package.json
COPY --from=builder --chown=comicdb:comicdb /app/scripts ./scripts
COPY --from=builder --chown=comicdb:comicdb /app/drizzle ./drizzle
USER comicdb
EXPOSE 3000
CMD ["npm", "start"]
