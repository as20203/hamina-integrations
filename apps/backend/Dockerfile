FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/backend ./apps/backend
COPY packages/database ./packages/database

RUN npm install
RUN npm run db:generate --workspace @repo/db
RUN npm run build --workspace backend

EXPOSE 4000

CMD ["npm", "run", "start:backend"]
