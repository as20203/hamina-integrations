FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/frontend ./apps/frontend

RUN npm install
RUN npm run build --workspace frontend

EXPOSE 3000

CMD ["npm", "run", "start:frontend"]
