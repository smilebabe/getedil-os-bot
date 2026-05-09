FROM node:20-slim

WORKDIR /app

# Copy only the bot package
COPY apps/bot/package.json apps/bot/package-lock.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy built app
COPY apps/bot/dist ./dist

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

EXPOSE 3000

CMD ["node", "dist/app.js"]
