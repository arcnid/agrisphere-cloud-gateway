# ─── Builder Stage ────────────────────────────────────────────────────────────
FROM node:20-bullseye-slim AS builder
WORKDIR /usr/src/app

# Install dev+prod dependencies
COPY package*.json tsconfig.json ./
RUN npm ci

# Compile TypeScript
COPY src ./src
RUN npm run build

# ─── Production Stage ─────────────────────────────────────────────────────────
FROM node:20-bullseye-slim
WORKDIR /usr/src/app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bring compiled code from builder
COPY --from=builder /usr/src/app/dist ./dist

# Supply environment variables at runtime (via .env file recommended)
ENV SUPABASE_URL="https://pzndsucdxloknrgecijj.supabase.co"
ENV SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bmRzdWNkeGxva25yZ2VjaWpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDc2NjQ5NywiZXhwIjoyMDU2MzQyNDk3fQ.ozasWT_E1uuu1ceEmPSmLrEYhLBHsDWhgqKcGv9IZJk"

# Launch your app
CMD ["node", "dist/index.js"]
