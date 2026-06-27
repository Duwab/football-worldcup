/**
 * Récupère les classements de la phase de groupes WC 2026
 * Sortie : data/standings/groups.json
 */
require('dotenv').config();
const fse = require('fs-extra');
const path = require('path');
const { get } = require('./api');

const SEASON = process.env.SEASON || '2026';
const OUT_DIR = path.join(__dirname, '../data/standings');

async function fetchStandings() {
  console.log(`\n📊  Récupération des classements WC ${SEASON}…`);

  const data = await get(`/competitions/WC/standings`, { season: SEASON });

  const groups = data.standings.map((group) => ({
    stage: group.stage,
    type: group.type,
    group: group.group,
    table: group.table.map((row) => ({
      position: row.position,
      team: { id: row.team.id, name: row.team.name, tla: row.team.tla },
      playedGames: row.playedGames,
      won: row.won,
      draw: row.draw,
      lost: row.lost,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalDifference,
      points: row.points,
    })),
  }));

  await fse.ensureDir(OUT_DIR);
  const outPath = path.join(OUT_DIR, 'groups.json');
  await fse.writeJson(outPath, { season: SEASON, updatedAt: new Date().toISOString(), groups }, { spaces: 2 });

  const groupCount = groups.length;
  console.log(`✅  ${groupCount} groupes sauvegardés → ${outPath}`);
  return groups;
}

if (require.main === module) {
  fetchStandings().catch((err) => { console.error('❌', err.message); process.exit(1); });
}

module.exports = { fetchStandings };
