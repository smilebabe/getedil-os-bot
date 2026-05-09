FROM node:20-slim

WORKDIR /app

# Copy root package files (monorepo lockfile)
COPY package.json package-lock.json ./
COPY apps/bot/package.json ./apps/bot/

# Install only the bot's production deps
RUN npm install --omit=dev --workspace=@getedil/bot

# Copy built dist
COPY apps/bot/dist ./apps/bot/dist

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

EXPOSE 3000

WORKDIR /app/apps/bot
CMD ["node", "dist/app.js"]
