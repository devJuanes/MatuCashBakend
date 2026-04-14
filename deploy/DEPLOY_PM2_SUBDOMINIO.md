# Deploy PM2 + Subdominio (Ubuntu)

## 1) Requisitos en servidor

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo npm i -g pm2
```

## 2) Subir backend y configurar variables

```bash
cd /var/www
git clone <tu-repo> matucash-backend
cd matucash-backend
npm ci
cp .env.example .env
```

Edita `.env` con tus datos reales:

- `NODE_ENV=production`
- `PORT=4100`
- `API_TOKEN=<token-seguro>`
- `CORS_ORIGIN=https://devjuanes.com,https://www.devjuanes.com`

## 3) Iniciar con PM2

```bash
npm run pm2:start
npm run pm2:save
pm2 startup
```

Ejecuta el comando que te devuelva `pm2 startup` para persistencia tras reinicio.

## 4) DNS del subdominio

En tu proveedor DNS crea:

- Tipo: `A`
- Host: `matucash`
- Valor: `<IP_PUBLICA_DE_TU_SERVIDOR>`

## 5) Nginx reverse proxy

```bash
sudo cp deploy/nginx/matucash-api.conf /etc/nginx/sites-available/matucash-api.conf
```

Confirma que `server_name` sea `matucash.devjuanes.com`, luego:

```bash
sudo ln -s /etc/nginx/sites-available/matucash-api.conf /etc/nginx/sites-enabled/matucash-api.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 6) SSL con Let's Encrypt

```bash
sudo certbot --nginx -d matucash.devjuanes.com
```

## 7) Verificación

```bash
curl https://matucash.devjuanes.com/api/health
pm2 logs matucash-whatsapp-api
```

Deberías recibir `{ "ok": true, ... }`.

## 8) Conectar frontend

En `MatuCash/.env`:

```env
VITE_WHATSAPP_API_URL=https://matucash.devjuanes.com
VITE_WHATSAPP_API_TOKEN=<mismo-token-que-API_TOKEN>
```
