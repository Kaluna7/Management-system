FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY src ./src
COPY assets ./assets
COPY scripts ./scripts
COPY data ./data

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && node src/server.js"]
