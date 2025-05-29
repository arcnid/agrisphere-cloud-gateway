# ─── Builder Stage ────────────────────────────────────────────────────────────
FROM node:18-alpine AS builder
WORKDIR /usr/src/app

# install dev+prod deps
COPY package*.json tsconfig.json ./
RUN npm ci

# compile TS
COPY src ./src
RUN npm run build


# ─── Production Stage ─────────────────────────────────────────────────────────
FROM node:18-alpine
WORKDIR /usr/src/app

# install only prod deps
COPY package*.json ./
RUN npm ci --only=production

# bring in compiled code
COPY --from=builder /usr/src/app/dist ./dist

# (optional) copy any other assets you need, e.g. .env, migrations, etc.

# supply your real values as runtime env
ENV SUPABASE_URL="https://pzndsucdxloknrgecijj.supabase.co"
ENV SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bmRzdWNkeGxva25yZ2VjaWpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDc2NjQ5NywiZXhwIjoyMDU2MzQyNDk3fQ.ozasWT_E1uuu1ceEmPSmLrEYhLBHsDWhgqKcGv9IZJk"

# launch
CMD ["node", "dist/index.js"]
