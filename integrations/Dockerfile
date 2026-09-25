# Build from the repository root, independently of the telephony service.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY integrations ./integrations
USER node
CMD ["node", "integrations/worker.js"]
