FROM node:20-slim

WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./
COPY pnpm-lock.yaml* ./

# Install pnpm and ALL dependencies (including dev deps for tsx)
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile

# Copy server source code
COPY server ./server

# Copy database schema
COPY drizzle ./drizzle

# Copy shared files
COPY shared ./shared

# Copy built frontend
COPY dist/client ./dist/client

# Expose port (Cloud Run will set this via PORT env var)
ENV PORT=8080
EXPOSE 8080

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/trpc/calls.stats', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run server with tsx (no compilation needed)
CMD ["npx", "tsx", "server/_core/index.ts"]
