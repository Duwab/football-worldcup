/**
 * Récupère les 48 équipes qualifiées pour la Coupe du Monde 2026
 * Sortie : data/teams/teams.json
 */
require('dotenv').config();
const fse = require('fs-extra');
const path = require('path');
const { get } = require('./api');

const SEASON = process.env.SEASON || '2026';
const OUT_DIR = path.join(__dirname, '../data/teams');

async function fetchTeams() {
  console.log(`\n🌍  Récupération des équipes WC ${SEASON}…`);

  const data = await get(`/competitions/WC/teams`, { season: SEASON });

  const teams = data.teams.map((t) => ({
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    tla: t.tla,
    crest: t.crest,
    coach: t.coach?.name ?? null,
    founded: t.founded ?? null,
    venue: t.venue ?? null,
    address: t.address ?? null,
    website: t.website ?? null,
    area: t.area,
  }));

  await fse.ensureDir(OUT_DIR);
  const outPath = path.join(OUT_DIR, 'teams.json');
  await fse.writeJson(outPath, { season: SEASON, count: teams.length, teams }, { spaces: 2 });

  console.log(`✅  ${teams.length} équipes sauvegardées → ${outPath}`);
  return teams;
}

if (require.main === module) {
  fetchTeams().catch((err) => { console.error('❌', err.message); process.exit(1); });
}

module.exports = { fetchTeams };
