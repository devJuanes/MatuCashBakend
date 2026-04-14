#!/usr/bin/env bash
set -euo pipefail

echo "==> Deploy MatuCash WhatsApp API"

echo "==> Cambiando a rama main"
git checkout main

echo "==> Bajando ultimos cambios"
git pull origin main

echo "==> Instalando dependencias"
npm install

echo "==> Reiniciando PM2"
pm2 restart matucash-whatsapp-api

echo "==> Deploy completado"
