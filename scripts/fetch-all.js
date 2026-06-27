/**
 * Lance tous les scripts de collecte de données dans l'ordre.
 * Usage : node scripts/fetch-all.js
 */
require('dotenv').config();

const { fetchTeams } = require('./fetch-teams');
const { fetchTournamentMatches, fetchTeamRecentMatches } = require('./fetch-matches');
const { fetchStandings } = require('./fetch-standings');
const { fetchRankings } = require('./fetch-rankings');
const { buildStats } = require('./fetch-stats');
const { fetchH2H } = require('./fetch-h2h');
const fse = require('fs-extra');
const path = require('path');

async function run() {
  console.log('🚀  Démarrage de la collecte complète — WC 2026\n');
  const start = Date.now();

  // 1. Équipes
  const teams = await fetchTeams();

  // 2. Matchs du tournoi
  await fetchTournamentMatches();

  // 3. Historique récent par équipe (dépend de fetch-teams)
  console.log(`\n📋  Récupération de l'historique récent pour ${teams.length} équipes…`);
  const matchesDir = path.join(__dirname, '../data/matches');
  await fse.ensureDir(matchesDir);

  for (const team of teams) {
    process.stdout.write(`   ${team.tla.padEnd(4)} … `);
    try {
      const matches = await fetchTeamRecentMatches(team.id, team.tla);
      console.log(`${matches.length} matchs`);
    } catch (err) {
      console.log(`erreur: ${err.message}`);
    }
  }

  // 4. Classements des groupes
  await fetchStandings();

  // 5. Rankings FIFA
  await fetchRankings();

  // 6. Statistiques calculées (pas d'appel API)
  await buildStats();

  // 7. H2H par groupe (pas d'appel API)
  await fetchH2H();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n🎉  Collecte terminée en ${elapsed}s`);
  console.log('   Données disponibles dans le dossier data/');
}

run().catch((err) => {
  console.error('\n❌  Erreur fatale:', err.message);
  process.exit(1);
});
