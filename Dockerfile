FROM node:24.8.0-alpine3.22 AS build

WORKDIR /app
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/design-system/package.json packages/design-system/package.json
RUN yarn install --immutable

COPY . .
RUN yarn build && yarn workspaces focus @boring-analytics/web --production

FROM alpine:3.22 AS geoip

ARG DBIP_COUNTRY_LITE_VERSION=2026-09
ARG DBIP_COUNTRY_LITE_SHA256=cb0578ce59f569f2c933bb40feb820804a334855a60739011b0a89cab1d6e4ed
RUN wget --quiet \
		"https://download.db-ip.com/free/dbip-country-lite-${DBIP_COUNTRY_LITE_VERSION}.mmdb.gz" \
		-O /tmp/dbip-country-lite.mmdb.gz \
	&& echo "${DBIP_COUNTRY_LITE_SHA256}  /tmp/dbip-country-lite.mmdb.gz" | sha256sum -c - \
	&& mkdir /geoip \
	&& gzip -dc /tmp/dbip-country-lite.mmdb.gz > /geoip/dbip-country-lite.mmdb

FROM node:24.8.0-alpine3.22 AS runtime

ENV NODE_ENV=production
ENV GEOIP_DATABASE_PATH=/app/apps/web/data/dbip-country-lite.mmdb
WORKDIR /app/apps/web

COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/packages/design-system /app/packages/design-system
COPY --from=build --chown=node:node /app/apps/web/build ./
COPY --from=geoip --chown=node:node /geoip/dbip-country-lite.mmdb ./data/dbip-country-lite.mmdb
COPY --chown=node:node docs/geoip.md ./data/README.md

USER node
EXPOSE 3333
CMD ["node", "bin/server.js"]
