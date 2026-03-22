FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/backend ./apps/backend
COPY packages/database ./packages/database

RUN npm config set fetch-retries 10 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm install
RUN npm run db:generate --workspace @repo/db
RUN npm run build --workspace backend

EXPOSE 4000

CMD ["npm", "run", "start:backend"]
