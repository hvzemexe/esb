// Point d'entrée pour le développement local uniquement.
// Sur Vercel, c'est api/index.js qui est utilisé directement comme fonction serverless,
// et /public est servi automatiquement par la plateforme (pas besoin d'express.static).
const path = require('path');
const express = require('express');
const app = require('./api/index');

// Sert le site statique en local pour pouvoir tester l'ensemble sur http://localhost:3000
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Site ESB (local) en ligne sur http://localhost:${PORT}`);
  console.log(`   Base de données : ${process.env.DATABASE_URL ? 'Supabase (Postgres)' : 'NON CONFIGURÉE (DATABASE_URL manquante)'}`);
});
