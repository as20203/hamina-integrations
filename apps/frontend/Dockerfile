FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/frontend ./apps/frontend

RUN npm config set fetch-retries 10 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm install
RUN npm run build --workspace frontend

EXPOSE 3000

CMD ["npm", "run", "start:frontend"]
