FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY packages ./packages
COPY apps/bot ./apps/bot

RUN npm install
RUN npm run build

FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/bot/dist ./apps/bot/dist
COPY --from=builder /app/apps/bot/package.json ./apps/bot/package.json
COPY content ./content

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:10000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "apps/bot/dist/app.js"]
