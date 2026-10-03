# QuiQuiz

Quiz photo en français (oiseaux, plantes, champignons, poissons, reptiles, contours de pays).

Site : [quiquiz.fr](https://quiquiz.fr)

## Stack

- Frontend statique dans `public/`
- API Node/Express dans `server/` (bassin photos, fichiers validés, admin Steam)
- Données runtime (pools, blacklist, images validées) dans `data-runtime/` (gitignoré)

## Développement local

```bash
cp .env.example .env
npm install
npm start
```

Ouvre http://localhost:4789/ et http://localhost:4789/admin/

Pour l’admin Steam en local, mets des URLs `http://localhost:4789/...` dans `.env`.

## Production (même VPS que CsShowcase)

1. DNS IONOS : enregistrements A/AAAA de `quiquiz.fr` (et `www`) vers l’IP du VPS
2. Clone le repo sur le VPS, configure `.env` avec les URLs `https://quiquiz.fr/...`
3. `npm install --omit=dev && npm start` (ou systemd, voir `deploy/quiquiz.service`)
4. Nginx : fichier d’exemple `deploy/nginx-quiquiz.fr.conf` + certbot TLS

## Admin

Compte Steam autorisé via `ADMIN_STEAM_IDS` (défaut : `76561198269405845`).  
Connexion : `/auth/steam` puis `/admin/`.
