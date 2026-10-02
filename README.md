# Site ESB — déploiement sur Vercel

Cette version du projet est adaptée pour **Vercel** (hébergement serverless, gratuit pour démarrer, HTTPS automatique).

⚠️ Différence importante avec la version VPS/Railway : Vercel n'a **pas de disque permanent**. La base de données est donc hébergée séparément. On utilise **Supabase** (Postgres hébergé, offre gratuite suffisante pour un site de club).

## 1. Créer la base de données Supabase

1. Créez un compte et un projet sur [supabase.com](https://supabase.com). Notez le **mot de passe de la base** choisi à la création.
2. Cliquez sur le bouton **Connect** en haut du tableau de bord.
3. Copiez la chaîne **Transaction pooler** (port **6543**, indispensable sur Vercel/serverless) :
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-xx.pooler.supabase.com:6543/postgres`
4. Remplacez `[YOUR-PASSWORD]` par votre mot de passe. S'il contient des caractères spéciaux (`@ # / :`), encodez-les (ex. `@` → `%40`).

Aucune table à créer à la main : elles sont créées automatiquement au premier appel (avec le contenu par défaut).

## 2. Déployer sur Vercel

**Option A — via le site web (le plus simple) :**
1. Mettez ce dossier sur un repo GitHub (créez un repo, `git init`, `git add .`, `git commit`, `git push`).
2. Sur [vercel.com](https://vercel.com), cliquez sur **Add New → Project**, importez votre repo GitHub.
3. Dans **Environment Variables**, ajoutez :
   - `DATABASE_URL` → la chaîne Supabase récupérée à l'étape 1
   - `JWT_SECRET` → une longue chaîne aléatoire (ex. générée avec `openssl rand -hex 32`)
   - `ADMIN_DEFAULT_PASSWORD` → le mot de passe admin initial
   - `NODE_ENV` → `production`
4. Cliquez sur **Deploy**.

**Option B — via la CLI Vercel (sans GitHub) :**
```bash
npm install -g vercel
vercel login
vercel          # suit les instructions, déploie en preview
vercel env add DATABASE_URL
vercel env add JWT_SECRET
vercel env add ADMIN_DEFAULT_PASSWORD
vercel --prod   # déploiement final en production
```

## 3. Tester

Ouvrez l'URL fournie par Vercel (ex. `esb-bouchemma.vercel.app`). Connectez-vous à l'espace admin avec le mot de passe défini dans `ADMIN_DEFAULT_PASSWORD`, puis **changez-le immédiatement** depuis l'onglet Sécurité.

## 4. Connecter votre propre nom de domaine (optionnel)

Dans le tableau de bord Vercel → votre projet → **Settings → Domains**, ajoutez votre domaine et suivez les instructions DNS affichées (en général un enregistrement CNAME ou A chez votre registrar).

## 5. Développement local

```bash
npm install
cp .env.example .env
# renseignez DATABASE_URL (Supabase, ou un Postgres local), JWT_SECRET, ADMIN_DEFAULT_PASSWORD
npm start
```
→ http://localhost:3000

## Photos (actualités et effectif)

Dans l'espace admin, onglets **Actualités** et **Effectif** : chaque carte a un bouton « Choisir une photo ». L'image est automatiquement réduite (JPEG, 1200 px pour les actualités, 800 px pour les joueurs) puis stockée dans la base (table `images`) — aucun service supplémentaire n'est nécessaire. Cliquez ensuite sur « Enregistrer et publier ». Les photos qui ne sont plus utilisées sont supprimées automatiquement.

## Articles partageables

Chaque actualité a sa propre page : `https://votre-site/article/<identifiant>`. Sur le site, la carte propose « Ouvrir l'article → » ; dans l'espace admin (onglet Actualités), le lien à partager s'affiche sous chaque actualité avec un bouton « Copier le lien » (le lien apparaît après un premier « Enregistrer et publier »). Renseignez le « Texte complet » pour l'article (optionnel : sans lui, la page affiche le résumé).

La page de l'article est générée côté serveur avec les balises Open Graph : lorsqu'on colle le lien sur Facebook, WhatsApp, X, etc., l'aperçu montre le titre, le résumé et la photo de l'actualité. Les boutons de partage (Facebook, WhatsApp, X, copier, partage natif du téléphone) sont sur la page. Variable optionnelle `SITE_URL` si vous voulez forcer l'adresse publique utilisée dans les liens.

## Structure du projet

```
esb-vercel/
├── api/
│   └── index.js        → l'app Express complète, exportée (fonction serverless Vercel)
├── db.js                → connexion Supabase (Postgres) + schéma + contenu par défaut
├── server.js             → point d'entrée pour le développement local uniquement
├── vercel.json            → route /api/* vers api/index.js
├── public/
│   ├── index.html          → site public + interface admin (servi tel quel par Vercel)
│   └── images/logo.jpg
└── .env.example
```

## Sécurité de la base

Au démarrage, `db.js` active le **Row Level Security** sur les tables `site_content`, `admin` et `images`. Cela empêche l'API publique de Supabase (clé `anon`) de lire ou modifier ces tables, notamment le hash du mot de passe admin. Le serveur, lui, se connecte avec le rôle `postgres` et n'est pas affecté.
