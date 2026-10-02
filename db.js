const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Base de données : Postgres hébergé par Supabase (variable DATABASE_URL).
// Sur Vercel (serverless), utiliser la chaîne "Transaction pooler" (port 6543) de Supabase.
if (!process.env.DATABASE_URL) {
  console.warn('⚠️  DATABASE_URL manquante : renseignez la chaîne de connexion Supabase.');
}

const isLocalDb = /@(localhost|127\.0\.0\.1)[:\/]/.test(process.env.DATABASE_URL || '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
  max: 1 // serverless : une seule connexion par instance de fonction
});

// Convertit les placeholders "?" en "$1, $2, ..." (syntaxe Postgres).
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
}

// Même interface que l'ancien client libSQL : client.execute('SQL') ou client.execute({ sql, args }).
const client = {
  async execute(q) {
    const sql = typeof q === 'string' ? q : q.sql;
    const args = typeof q === 'string' ? [] : (q.args || []);
    const r = await pool.query(toPg(sql), args);
    return { rows: r.rows };
  }
};

const DEFAULT_CONTENT = {
  general: {
    clubNameFr: "ESPOIR SPORTIF BOUCHEMMA",
    clubNameAr: "الأمل الرياضي بوشمة",
    heroTitle: "L'Amour du Maillot, l'Espoir du Village.",
    heroEyebrow: "Bouchemma · Tunisie · Fondé en 2001",
    heroLead: "Depuis 2001, l'ESB porte les couleurs bleu et blanc de Bouchemma sur les terrains tunisiens — un club formateur, ancré dans son quartier et tourné vers ses jeunes.",
    city: "Bouchemma",
    founded: "2001",
    colorsLabel: "Bleu & Blanc",
    primaryColor: "#0d1c3d",
    accentColor: "#c8a24d"
  },
  news: [
    { date: "07 SEPT.", title: "Reprise des entraînements pour la nouvelle saison", summary: "Le groupe s'est retrouvé cette semaine pour lancer la préparation, avec plusieurs nouveaux visages dans l'effectif." },
    { date: "02 SEPT.", title: "L'équipe des jeunes qualifiée pour les régionales", summary: "La catégorie U19 valide sa place pour la phase régionale après une belle campagne de qualification." },
    { date: "28 AOÛT", title: "Nouveau partenariat local pour la saison", summary: "Le club annonce un partenariat avec des commerçants de Bouchemma pour soutenir les équipes de jeunes." }
  ],
  history: [
    { year: "2001", title: "Fondation du club", text: "L'Espoir Sportif Bouchemma voit le jour, porté par des passionnés du village souhaitant offrir un club à leur jeunesse." },
    { year: "—", title: "Développement des catégories jeunes", text: "Mise en place progressive des équipes de jeunes, pilier de la philosophie du club depuis sa création." },
    { year: "—", title: "Ancrage dans le tissu local", text: "L'ESB devient un repère du quartier, rassemblant familles et supporters autour des couleurs du club." },
    { year: "2026", title: "Une nouvelle saison, une nouvelle ambition", text: "Le club continue de grandir, avec un effectif renouvelé et l'objectif de faire progresser toutes ses équipes." }
  ],
  squad: [
    { number: "1", position: "GARDIEN", name: "Joueur A." },
    { number: "4", position: "DÉFENSEUR", name: "Joueur B." },
    { number: "6", position: "MILIEU", name: "Joueur C." },
    { number: "9", position: "ATTAQUANT", name: "Joueur D." }
  ],
  standings: [
    { team: "ESB", won: "0", drawn: "0", lost: "0", gf: "0", ga: "0" },
    { team: "AS Kalâa", won: "0", drawn: "0", lost: "0", gf: "0", ga: "0" },
    { team: "CS Menzah", won: "0", drawn: "0", lost: "0", gf: "0", ga: "0" },
    { team: "Étoile Jendouba", won: "0", drawn: "0", lost: "0", gf: "0", ga: "0" }
  ],
  shop: [
    { name: "Maillot domicile ESB", price: "45 DT", description: "Maillot officiel bleu et blanc.", sizes: "S, M, L, XL", stock: "in", photo: "" },
    { name: "Écharpe du supporter", price: "15 DT", description: "Écharpe tricot aux couleurs du club.", sizes: "", stock: "in", photo: "" }
  ],
  fixtures: [
    { day: "14", month: "SEPT.", home: "ESB", away: "AS Kalâa", competition: "Championnat régional — Journée 1", venue: "Domicile · 15h00" },
    { day: "21", month: "SEPT.", home: "CS Menzah", away: "ESB", competition: "Championnat régional — Journée 2", venue: "Extérieur · 15h00" },
    { day: "28", month: "SEPT.", home: "ESB", away: "Étoile Jendouba", competition: "Championnat régional — Journée 3", venue: "Domicile · 15h30" }
  ],
  contact: {
    address: "Bouchemma, Tunisie",
    email: "contact@esb-bouchemma.tn",
    phone: "+216 00 000 000",
    facebook: "",
    instagram: "",
    youtube: ""
  }
};

let initPromise = null;

async function _init() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS site_content (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      mime TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Sécurité : empêche l'API REST publique de Supabase (clé anon) de lire ces tables.
  // La connexion du serveur (rôle postgres) n'est pas concernée.
  for (const t of ['site_content', 'admin', 'images']) {
    await client.execute(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }

  const content = await client.execute('SELECT 1 FROM site_content WHERE id = 1');
  if (content.rows.length === 0) {
    await client.execute({
      sql: 'INSERT INTO site_content (id, data) VALUES (1, ?)',
      args: [JSON.stringify(DEFAULT_CONTENT)]
    });
  }

  const admin = await client.execute('SELECT 1 FROM admin WHERE id = 1');
  if (admin.rows.length === 0) {
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'esb2001';
    const hash = bcrypt.hashSync(defaultPassword, 10);
    await client.execute({
      sql: 'INSERT INTO admin (id, password_hash) VALUES (1, ?)',
      args: [hash]
    });
  }
}

// Mémorise l'init en cours pour éviter de la relancer à chaque requête (important en serverless).
function ensureInit() {
  if (!initPromise) initPromise = _init();
  return initPromise;
}

module.exports = { client, ensureInit };
