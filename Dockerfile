# Multiple-stage Dockerfile for PMP System (pnpm monorepo)

# Stage 1: Base - Setup pnpm and workspace
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
COPY . .

# Stage 2: Build
FROM base AS builder
# Install all dependencies
RUN pnpm install --frozen-lockfile
# Build the whole monorepo
RUN pnpm build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy necessary production files
COPY --from=builder /app/package.json .
COPY --from=builder /app/pnpm-workspace.yaml .
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/client/dist ./client/dist

# Expose port (Azure App Service often uses 80 or 8080)
EXPOSE 5000
ENV PORT=5000

# Start the server (which serves API and can be updated to serve client too)
CMD ["node", "server/dist/server/index.js"]
