# --- build -------------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY . .
ARG VITE_SIGNALING_URL=""
ENV VITE_SIGNALING_URL=$VITE_SIGNALING_URL
RUN npm run build && npm prune --omit=dev

# --- runtime -----------------------------------------------------------------
FROM node:20-alpine
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
# UR Chat keeps invitation metadata here; mount a volume to keep it across deploys.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3001/healthz || exit 1
CMD ["node", "server/dist/index.js"]
