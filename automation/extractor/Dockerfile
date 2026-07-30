FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs description.mjs ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.mjs"]
