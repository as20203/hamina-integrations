# Browser versions match @playwright/test — bump tag when package-lock Playwright version changes.
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

COPY . .

RUN npm ci

# Run via `sh` so `./e2e` bind-mount from the host does not require +x on docker-entrypoint.sh.
ENTRYPOINT ["/bin/sh", "/app/e2e/docker-entrypoint.sh"]
