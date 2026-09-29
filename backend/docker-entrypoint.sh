#!/bin/sh
set -e

echo "==> Running database migrations (Prisma migrate deploy)..."
npx prisma migrate deploy

echo "==> Starting NestJS backend server..."
exec "$@"
