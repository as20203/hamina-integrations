# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/frontend ./apps/frontend

RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 20 \
  && npm config set fetch-retry-mintimeout 30000 \
  && npm config set fetch-retry-maxtimeout 180000 \
  && npm config set fetch-timeout 600000 \
  && (npm install \
    || (echo "npm install failed; retry 1/2 in 45s..." && sleep 45 && npm install) \
    || (echo "npm install failed; retry 2/2 in 90s..." && sleep 90 && npm install))
RUN npm run build --workspace frontend

EXPOSE 3000

CMD ["npm", "run", "start:frontend"]
