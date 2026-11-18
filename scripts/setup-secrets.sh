#!/usr/bin/env bash
# Simpan kredensial service account Google sebagai Worker secrets.
#
# Cara pakai (dari folder worker/):
#   ../scripts/setup-secrets.sh
#   ../scripts/setup-secrets.sh /lokasi/file-key.json
#
# Script ini membaca file JSON key, mengambil client_email dan
# private_key, lalu menyimpannya lewat `wrangler secret put`.
# Nilai secret dikirim lewat stdin supaya tidak terekam di riwayat shell
# dan tidak pernah ditampilkan di layar.
set -euo pipefail

cd "$(dirname "$0")/../worker"

KEY_FILE="${1:-}"
if [ -z "$KEY_FILE" ]; then
  read -r -p "Lokasi file JSON key service account: " KEY_FILE
fi

if [ ! -f "$KEY_FILE" ]; then
  echo "File tidak ditemukan: $KEY_FILE" >&2
  exit 1
fi

# Ambil client_email dan private_key dengan python3 (tanpa jq).
CLIENT_EMAIL=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['client_email'])" "$KEY_FILE")
if [ -z "$CLIENT_EMAIL" ]; then
  echo "File key tidak berisi client_email." >&2
  exit 1
fi

echo "Menyimpan SHEETS_CLIENT_EMAIL ($CLIENT_EMAIL)..."
printf '%s' "$CLIENT_EMAIL" | wrangler secret put SHEETS_CLIENT_EMAIL

echo "Menyimpan SHEETS_PRIVATE_KEY..."
python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['private_key'], end='')" "$KEY_FILE" \
  | wrangler secret put SHEETS_PRIVATE_KEY

echo "Selesai. Kedua secret sudah tersimpan."
echo "Lanjutkan dengan: wrangler deploy"
