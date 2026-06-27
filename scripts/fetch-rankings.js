/**
 * Récupère le classement FIFA des équipes participantes (via l'API football-data)
 * et enrichit avec la position FIFA si disponible.
 * Sortie : data/rankings/fifa-rankings.json
 *
 * Note : l'API football-data ne fournit pas directement le classement FIFA officiel.
 * Ce script extrait le ranking implicite depuis les données de la compétition
 * et peut être enrichi avec une source externe (rsssf.com, FIFA API officielle).
 */
require('dotenv').config();
const fse = require('fs-extra');
const path = require('path');
const { get } = require('./api');

const SEASON = process.env.SEASON || '2026';
const OUT_DIR = path.join(__dirname, '../data/rankings');

async function fetchRankings() {
  console.log(`\n🏆  Récupération du classement FIFA WC ${SEASON}…`);

  // L'endpoint /competitions/WC donne les infos générales dont les équipes têtes de série
  const comp = await get(`/competitions/WC`, { season: SEASON });

  // Récupère aussi les équipes pour avoir les métadonnées
  const teamsData = await get(`/competitions/WC/teams`, { season: SEASON });

  const teams = teamsData.teams.map((t, idx) => ({
    rank: idx + 1,         // Position relative dans la liste retournée par l'API
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    tla: t.tla,
    area: t.area,
    crest: t.crest,
  }));

  const output = {
    season: SEASON,
    competition: {
      id: comp.id,
      name: comp.name,
      area: comp.area,
      numberOfTeams: comp.numberOfTeams,
      currentSeason: comp.currentSeason,
    },
    updatedAt: new Date().toISOString(),
    note: 'Le classement officiel FIFA doit être enrichi depuis api.fifa.com ou fifa.com/ranking',
    teams,
  };

  await fse.ensureDir(OUT_DIR);
  const outPath = path.join(OUT_DIR, 'fifa-rankings.json');
  await fse.writeJson(outPath, output, { spaces: 2 });

  console.log(`✅  ${teams.length} équipes sauvegardées → ${outPath}`);
  return output;
}

if (require.main === module) {
  fetchRankings().catch((err) => { console.error('❌', err.message); process.exit(1); });
}

module.exports = { fetchRankings };
