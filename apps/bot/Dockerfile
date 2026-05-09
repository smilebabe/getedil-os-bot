FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/bot/package.json ./apps/bot/

RUN npm install --omit=dev --workspace=@getedil/bot

COPY apps/bot/dist ./apps/bot/dist
COPY content/ ./content/

EXPOSE 10000

WORKDIR /app/apps/bot
CMD ["node", "dist/app.js"]
