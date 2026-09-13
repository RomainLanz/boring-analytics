FROM node:24.8.0-alpine3.22 AS build

WORKDIR /app
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/design-system/package.json packages/design-system/package.json
RUN yarn install --immutable

COPY . .
RUN yarn build && yarn workspaces focus @boring-analytics/web --production

FROM node:24.8.0-alpine3.22 AS runtime

ENV NODE_ENV=production
WORKDIR /app/apps/web

COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/packages/design-system /app/packages/design-system
COPY --from=build --chown=node:node /app/apps/web/build ./

USER node
EXPOSE 3333
CMD ["node", "bin/server.js"]
