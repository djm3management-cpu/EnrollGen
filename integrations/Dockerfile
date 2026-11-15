# Build from the repository root, independently of the telephony service.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY integrations ./integrations
COPY src/lib/carrierAliases.js src/lib/enrollmentIntake.js src/lib/deploymentPublic.js src/lib/ghlFields.js ./src/lib/
# Provider streaming helpers use Node built-ins only; no telephony server startup.
COPY telephony/src/recordings.js ./telephony/src/recordings.js
COPY telephony/src/lib ./telephony/src/lib
USER node
CMD ["node", "integrations/worker.js"]
