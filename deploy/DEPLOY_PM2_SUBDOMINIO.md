# Deploy PM2 + Subdominio (Ubuntu, con otros procesos PM2 activos)

## 1) Requisitos en servidor

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo npm i -g pm2
```

## 2) Subir backend y configurar variables

```bash
cd ~/apps
git clone <tu-repo> MatuCashBakend
cd MatuCashBakend
npm ci
cp .env.example .env
```

Edita `.env` con tus datos reales:

- `NODE_ENV=production`
- `PORT=4100`
- `API_TOKEN=<token-seguro>`
- `CORS_ORIGIN=https://matudb.com,https://www.matudb.com`

## 3) Iniciar con PM2

> Como este servidor ya tiene otros proyectos en PM2, **NO** uses `pm2 delete all`.

```bash
npm run pm2:start
pm2 list
```

Si ya existe ese proceso, usa:

```bash
npm run pm2:restart
```

Persistencia tras reinicio:

```bash
pm2 startup
npm run pm2:save
```

Ejecuta el comando que te devuelva `pm2 startup`.

## 4) DNS del subdominio

En tu proveedor DNS crea:

- Tipo: `A`
- Host: `matucash`
- Valor: `<IP_PUBLICA_DE_TU_SERVIDOR>`
- Si existe `AAAA` para `matucash`, elimínalo por ahora.

## 5) Nginx reverse proxy

```bash
sudo cp deploy/nginx/matucash-api.conf /etc/nginx/sites-available/matucash-api.conf
```

Confirma que `server_name` sea `matucash.matudb.com`, luego:

```bash
sudo ln -s /etc/nginx/sites-available/matucash-api.conf /etc/nginx/sites-enabled/matucash-api.conf
sudo nginx -t
sudo systemctl reload nginx
```

Si ya existía el enlace simbólico, ignora el warning.

## 6) SSL con Let's Encrypt

```bash
sudo certbot --nginx -d matucash.matudb.com
```

## 7) Verificación

```bash
curl https://matucash.matudb.com/api/health
pm2 logs matucash-whatsapp-api
```

Deberías recibir `{ "ok": true, ... }`.

## 8) Conectar frontend

En `MatuCash/.env`:

```env
VITE_WHATSAPP_API_URL=https://matucash.matudb.com
VITE_WHATSAPP_API_TOKEN=<mismo-token-que-API_TOKEN>
```

## 9) Comandos de operación (sin afectar otros proyectos PM2)

```bash
pm2 list
pm2 logs matucash-whatsapp-api --lines 100
pm2 restart matucash-whatsapp-api
pm2 stop matucash-whatsapp-api
pm2 start matucash-whatsapp-api
pm2 save
```
