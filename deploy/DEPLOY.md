# Déploiement quiquiz.fr (VPS partagé avec CsShowcase)

## 1. DNS IONOS

Dans la zone DNS de `quiquiz.fr` :

- `A` `@` → IP publique du VPS
- `A` `www` → même IP (ou CNAME `www` → `@`)

Propager quelques minutes à quelques heures.

## 2. Application sur le VPS

```bash
sudo mkdir -p /var/www/quiquiz
sudo chown "$USER":"$USER" /var/www/quiquiz
git clone https://github.com/Emsacras/quiquiz.git /var/www/quiquiz
cd /var/www/quiquiz
cp .env.example .env
nano .env   # STEAM_*, SESSION_SECRET, COOKIE_SECURE=1, PORT=4789
npm install --omit=dev
```

## 3. Systemd

```bash
sudo cp deploy/quiquiz.service /etc/systemd/system/quiquiz.service
# Ajuste User/WorkingDirectory si besoin
sudo systemctl daemon-reload
sudo systemctl enable --now quiquiz
sudo systemctl status quiquiz
```

## 4. Nginx + TLS

```bash
sudo cp deploy/nginx-quiquiz.fr.conf /etc/nginx/sites-available/quiquiz.fr
sudo ln -sf /etc/nginx/sites-available/quiquiz.fr /etc/nginx/sites-enabled/quiquiz.fr
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d quiquiz.fr -d www.quiquiz.fr
```

Vérifie que le port `4789` n’est **pas** exposé publiquement (firewall) : seul nginx écoute 80/443.

## 5. Steam

Dans `.env` production :

```
STEAM_RETURN_URL=https://quiquiz.fr/auth/steam/return
STEAM_REALM=https://quiquiz.fr/
STEAM_WEB_API_KEY=...   # même clé CsShowcase OK
```

## 6. Données validées

Les images validées vivent dans `data-runtime/`. Persiste ce dossier (backup) ; ne le mets pas dans git.
