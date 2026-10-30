#!/bin/sh
set -e

ACCESS_KEY="${S3_ACCESS_KEY:-${MINIO_ROOT_USER:-shanyraq_minio}}"
SECRET_KEY="${S3_SECRET_KEY:-${MINIO_ROOT_PASSWORD:-shanyraq_minio_secret_key}}"

mkdir -p /etc/seaweedfs
cat <<EOF > /etc/seaweedfs/s3.json
{
  "identities": [
    {
      "name": "anonymous",
      "actions": [
        "Read:shanyraq-media",
        "List:shanyraq-media"
      ]
    },
    {
      "name": "admin",
      "credentials": [
        {
          "accessKey": "$ACCESS_KEY",
          "secretKey": "$SECRET_KEY"
        }
      ],
      "actions": [
        "Admin",
        "Read",
        "List",
        "Tagging",
        "Write"
      ]
    }
  ]
}
EOF

(
  echo "[S3-init] Waiting for SeaweedFS filer..."
  while ! nc -z 127.0.0.1 8888 2>/dev/null; do
    sleep 0.5
  done
  sleep 1
  echo "[S3-init] Filer is ready, creating default buckets..."
  echo "s3.bucket.create -name shanyraq-media" | weed shell -filer=127.0.0.1:8888 2>/dev/null || true
  echo "s3.bucket.create -name shanyraq-documents" | weed shell -filer=127.0.0.1:8888 2>/dev/null || true
  echo "[S3-init] Buckets initialized."
) &

exec /usr/bin/weed server -dir=/data -volume.max=100 -s3 -s3.port=9000 -s3.config=/etc/seaweedfs/s3.json "$@"
