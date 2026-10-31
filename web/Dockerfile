FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

# Nitro's output carries its own dependencies.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output ./.output
CMD ["node", ".output/server/index.mjs"]
