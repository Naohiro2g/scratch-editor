# syntax=docker/dockerfile:1.18

FROM node:24.16.0-alpine3.22@sha256:191c9f0080fcbbc6547a85dc0ff7988072214a355aabdc1d2ec55a7dae5eea8a

ARG SOURCE_REVISION
ARG RELEASE_VERSION
LABEL org.opencontainers.image.source="https://github.com/Naohiro2g/scratch-editor" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.version="${RELEASE_VERSION}" \
      org.opencontainers.image.title="McRemote Bridge" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node dist/ ./dist/
COPY --chown=node:node node_modules/ws/ ./node_modules/ws/

USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
