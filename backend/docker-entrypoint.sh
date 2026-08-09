#!/bin/sh
set -e

echo "Applying database migrations…"
./node_modules/.bin/prisma migrate deploy --schema=backend/prisma/schema.prisma

echo "Starting CoreStudio backend…"
exec node backend/server.js
