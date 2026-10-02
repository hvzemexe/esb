require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { client, ensureInit } = require('../db');
const { renderArticle, renderNotFound } = require('../article');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const COOKIE_NAME = 'esb_admin_token';
const isProd = process.env.NODE_ENV === 'production';

// Parseur JSON standard (1 Mo) pour tout sauf l'upload de photos (qui a sa propre limite plus haute).
const jsonSmall = express.json({ limit: '1mb' });
const jsonUpload = express.json({ limit: '4mb' });
app.use((req, res, next) => (req.path === '/api/upload' ? next() : jsonSmall(req, res, next)));
app.use(cookieParser());

// S'assure que les tables existent avant de traiter toute requête API.
app.use(async (req, res, next) => {
  try {
    await ensureInit();
    next();
  } catch (e) {
    console.error('Erreur init DB:', e);
    res.status(500).json({ error: "Erreur de connexion à la base de données." });
  }
});

// --- limiteur basique de tentatives de connexion (best-effort en environnement serverless) ---
const loginAttempts = new Map();
function rateLimitLogin(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.ip;
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return next();
  }
  if (entry.count >= 10) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  }
  entry.count++;
  next();
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Non authentifié.' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session invalide ou expirée.' });
  }
}

// ---------- AUTH ----------
app.post('/api/login', rateLimitLogin, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Mot de passe requis.' });

  const result = await client.execute('SELECT password_hash FROM admin WHERE id = 1');
  const row = result.rows[0];
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }

  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.json({ authenticated: false });
  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true });
  } catch (e) {
    res.json({ authenticated: false });
  }
});

app.post('/api/change-password', requireAuth, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  await client.execute({ sql: 'UPDATE admin SET password_hash = ? WHERE id = 1', args: [hash] });
  res.json({ ok: true });
});

// ---------- CONTENT ----------
// Chaque actualité a un identifiant stable (sert dans le lien /article/<id>).
const NEWS_ID_RE = /^[a-f0-9]{10}$/;
function ensureNewsIds(data) {
  let changed = false;
  const seen = new Set();
  for (const n of data.news) {
    if (!n || typeof n !== 'object') continue;
    if (!NEWS_ID_RE.test(n.id || '') || seen.has(n.id)) {
      n.id = crypto.randomBytes(5).toString('hex');
      changed = true;
    }
    seen.add(n.id);
  }
  return changed;
}

app.get('/api/content', async (req, res) => {
  const result = await client.execute('SELECT data, updated_at FROM site_content WHERE id = 1');
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'Contenu introuvable.' });
  const content = JSON.parse(row.data);
  // Contenu existant sans identifiants : on les génère une fois pour toutes.
  if (Array.isArray(content.news) && ensureNewsIds(content)) {
    await client.execute({ sql: 'UPDATE site_content SET data = ? WHERE id = 1', args: [JSON.stringify(content)] });
  }
  res.json({ content, updatedAt: row.updated_at });
});

// ---------- PAGE ARTICLE (HTML rendu côté serveur, pour les aperçus sur les réseaux sociaux) ----------
function baseUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

app.get('/article/:id', async (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    if (!NEWS_ID_RE.test(req.params.id)) return res.status(404).send(renderNotFound());
    const result = await client.execute('SELECT data FROM site_content WHERE id = 1');
    const content = result.rows[0] ? JSON.parse(result.rows[0].data) : null;
    const article = content && (content.news || []).find(n => n.id === req.params.id);
    if (!article) return res.status(404).send(renderNotFound());
    res.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.send(renderArticle(content, article, baseUrl(req)));
  } catch (e) {
    console.error('Erreur article:', e);
    res.status(500).send(renderNotFound());
  }
});

// ---------- IMAGES (stockées dans la base, car Vercel n'a pas de disque permanent) ----------
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_URL_RE = /^\/api\/images\/[a-f0-9]{16}$/;

app.post('/api/upload', requireAuth, jsonUpload, async (req, res) => {
  const { dataUrl } = req.body || {};
  const m = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,/);
  if (!m) return res.status(400).json({ error: 'Format d\'image non supporté (JPEG, PNG ou WebP).' });
  const b64 = dataUrl.slice(m[0].length);
  if (Buffer.byteLength(b64, 'base64') > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: 'Image trop lourde (3 Mo maximum).' });
  }
  const id = crypto.randomBytes(8).toString('hex');
  await client.execute({
    sql: 'INSERT INTO images (id, mime, data) VALUES (?, ?, ?)',
    args: [id, m[1], b64]
  });
  res.json({ ok: true, url: `/api/images/${id}` });
});

app.get('/api/images/:id', async (req, res) => {
  if (!/^[a-f0-9]{16}$/.test(req.params.id)) return res.status(404).end();
  const result = await client.execute({ sql: 'SELECT mime, data FROM images WHERE id = ?', args: [req.params.id] });
  const row = result.rows[0];
  if (!row) return res.status(404).end();
  res.set('Content-Type', row.mime);
  // L'id change à chaque nouvelle photo : on peut donc la mettre en cache durablement.
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(row.data, 'base64'));
});

// Supprime les photos qui ne sont plus utilisées (importées depuis plus d'1 heure, pour ne pas toucher aux uploads en cours).
async function cleanupImages(data) {
  try {
    const used = JSON.stringify(data);
    const result = await client.execute("SELECT id FROM images WHERE created_at < NOW() - INTERVAL '1 hour'");
    for (const row of result.rows) {
      if (!used.includes(row.id)) {
        await client.execute({ sql: 'DELETE FROM images WHERE id = ?', args: [row.id] });
      }
    }
  } catch (e) {
    console.error('Nettoyage images:', e);
  }
}

function validateContent(data) {
  if (!data || typeof data !== 'object') return 'Format invalide.';
  const required = ['general', 'news', 'history', 'squad', 'fixtures', 'contact'];
  for (const key of required) {
    if (!(key in data)) return `Champ manquant : ${key}`;
  }
  if (!Array.isArray(data.news) || !Array.isArray(data.history) ||
      !Array.isArray(data.squad) || !Array.isArray(data.fixtures)) {
    return 'news, history, squad et fixtures doivent être des listes.';
  }
  if (data.standings === undefined) data.standings = [];
  if (!Array.isArray(data.standings)) return 'standings doit être une liste.';
  if (data.standings.length > 40) return 'Trop d\'équipes dans le classement (40 maximum).';
  if (data.shop === undefined) data.shop = [];
  if (!Array.isArray(data.shop)) return 'shop doit être une liste.';
  if (data.shop.length > 100) return 'Trop d\'articles (100 maximum).';
  for (const it of data.shop) {
    if (it && it.sizes && String(it.sizes).length > 200) return 'Liste de tailles trop longue (200 caractères maximum).';
  }
  for (const n of data.news) {
    if (n && n.body && String(n.body).length > 20000) return 'Texte d\'article trop long (20 000 caractères maximum).';
  }
  for (const item of [...data.news, ...data.squad, ...data.shop]) {
    if (item && item.photo && !IMAGE_URL_RE.test(item.photo)) return 'Photo invalide.';
  }
  for (const f of data.fixtures) {
    if (f && ((f.homeLogo && !IMAGE_URL_RE.test(f.homeLogo)) || (f.awayLogo && !IMAGE_URL_RE.test(f.awayLogo)))) {
      return 'Logo invalide.';
    }
  }
  return null;
}

app.put('/api/content', requireAuth, async (req, res) => {
  const data = req.body;
  const err = validateContent(data);
  if (err) return res.status(400).json({ error: err });

  ensureNewsIds(data);
  await client.execute({
    sql: 'UPDATE site_content SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
    args: [JSON.stringify(data)]
  });

  await cleanupImages(data);
  res.json({ ok: true, content: data });
});

module.exports = app;
