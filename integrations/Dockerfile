# Build from the repository root, independently of the telephony service.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY integrations ./integrations
# Provider streaming helpers use Node built-ins only; no telephony server startup.
COPY telephony/src/recordings.js ./telephony/src/recordings.js
USER node
CMD ["node", "integrations/worker.js"]
