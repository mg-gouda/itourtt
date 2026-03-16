# ── Build stage ──
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build arg so the API URL is baked into the client bundle
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Feature flag: Car Dispatch (baked into client bundle at build time)
ARG NEXT_PUBLIC_ENABLE_CAR_DISPATCH
ENV NEXT_PUBLIC_ENABLE_CAR_DISPATCH=${NEXT_PUBLIC_ENABLE_CAR_DISPATCH}

# Bake version from package.json into the client bundle
ENV NEXT_PUBLIC_APP_VERSION=${NEXT_PUBLIC_APP_VERSION}
RUN export NEXT_PUBLIC_APP_VERSION=$(node -p "require('./package.json').version") && npm run build

# ── Production stage ──
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy standalone Next.js output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
