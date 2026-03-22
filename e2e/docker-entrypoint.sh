#!/bin/sh
set -e
BASE="${PLAYWRIGHT_BASE_URL:-http://frontend:3000}"
echo "Waiting for ${BASE} ..."
i=0
while [ "$i" -lt 90 ]; do
  if curl -sf "${BASE}/" >/dev/null 2>&1; then
    echo "App is up."
    exec npm run test:e2e "$@"
  fi
  i=$((i + 1))
  sleep 2
done
echo "Timeout waiting for app at ${BASE}"
exit 1
