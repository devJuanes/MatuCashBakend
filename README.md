# MatuCash WhatsApp Backend

Backend para enviar notificaciones automáticas de préstamos por WhatsApp usando `whatsapp-web.js`.

## Funciones

- Escaneo de QR para conectar una cuenta WhatsApp.
- Estado de sesión (`ready`, `qr`, `disconnected`).
- Cola de envío con retraso aleatorio para reducir comportamiento robótico.
- Simulación de "escribiendo..." antes de cada mensaje (duración según longitud del texto + jitter).
- Pausa aleatoria antes de escribir (`PRE_SEND_DELAY_*`).
- Plantillas por usuario en Firebase (`users/{uid}.notificationWhatsApp`) consumidas al enviar notificaciones.
- Endpoints listos para:
  - Préstamo creado
  - Abono recibido
  - Préstamo en mora
  - Ticket por URL

## Instalación

```bash
npm install
cp .env.example .env
npm run dev
```

## Endpoints

- `GET /api/health`
- `POST /api/whatsapp/init`
- `GET /api/whatsapp/status`
- `GET /api/whatsapp/qr`
- `POST /api/whatsapp/disconnect`
- `POST /api/notifications/loan-created`
- `POST /api/notifications/payment-received`
- `POST /api/notifications/loan-overdue`
- `POST /api/notifications/send-ticket`
- `POST /api/notifications/send-ticket-image`
- `POST /api/notifications/custom`
- `GET /api/whatsapp-templates/:uid` — leer plantillas y flag `enabled`
- `PUT /api/whatsapp-templates/:uid` — guardar plantillas (merge)
- `POST /api/uploads/cedula` — multipart (`file` + opcional `clientId`, `replaceOf` para borrar la imagen anterior)
- `GET /api/uploads/cedula/:fileName` — descarga la imagen (mismo `Authorization: Bearer` que el resto de `/api`)

Archivos se guardan en disco (`UPLOADS_DIR`, por defecto `./uploads/cedula/`). Ajusta `MAX_UPLOAD_MB` y en Nginx `client_max_body_size` si subes fotos grandes.

## Buenas prácticas anti-bloqueo

- Usa tiempos aleatorios entre mensajes (`MIN_SEND_DELAY_MS`, `MAX_SEND_DELAY_MS`).
- Ajusta `PRE_SEND_DELAY_*`, `TYPING_DURATION_*`, `TYPING_BASE_MS`, `TYPING_MS_PER_CHAR`, `TYPING_JITTER_MS` si necesitas ritmo más lento.
- No envíes spam masivo ni repetitivo.
- Personaliza mensajes con datos reales del cliente.
- Mantén una sola sesión por número.

> Nota: ningún método elimina al 100% el riesgo de bloqueo. Este backend reduce señales de automatización, pero siempre depende de políticas de WhatsApp.

## Producción (PM2 + Subdominio)

- Archivo PM2 listo: `ecosystem.config.cjs`
- Plantilla Nginx: `deploy/nginx/matucash-api.conf`
- Guía paso a paso: `deploy/DEPLOY_PM2_SUBDOMINIO.md`

Comandos rápidos:

```bash
npm run pm2:start
npm run pm2:logs
npm run pm2:save
```

Subdominio recomendado para este proyecto: `matucash.matudb.com`.
