/**
 * Récupère tous les matchs de la phase de groupes et à élimination directe WC 2026
 * + les 10 derniers matchs de chaque équipe (historique récent)
 * Sorties :
 *   data/matches/wc2026-all.json       — tous les matchs du tournoi
 *   data/matches/[team-tla].json       — historique récent par équipe
 */
require('dotenv').config();
const fse = require('fs-extra');
const path = require('path');
const { get } = require('./api');

const SEASON = process.env.SEASON || '2026';
const OUT_DIR = path.join(__dirname, '../data/matches');

async function fetchTournamentMatches() {
  console.log(`\n⚽  Récupération des matchs WC ${SEASON}…`);

  const data = await get(`/competitions/WC/matches`, { season: SEASON });

  const matches = data.matches.map((m) => ({
    id: m.id,
    utcDate: m.utcDate,
    status: m.status,
    stage: m.stage,
    group: m.group ?? null,
    homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name, tla: m.homeTeam.tla },
    awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name, tla: m.awayTeam.tla },
    score: {
      fullTime: m.score.fullTime,
      halfTime: m.score.halfTime,
      winner: m.score.winner,
    },
  }));

  await fse.ensureDir(OUT_DIR);
  const outPath = path.join(OUT_DIR, 'wc2026-all.json');
  await fse.writeJson(outPath, { season: SEASON, count: matches.length, matches }, { spaces: 2 });
  console.log(`✅  ${matches.length} matchs sauvegardés → ${outPath}`);

  return matches;
}

async function fetchTeamRecentMatches(teamId, tla) {
  const data = await get(`/teams/${teamId}/matches`, {
    limit: 10,
    status: 'FINISHED',
  });

  const matches = data.matches.map((m) => ({
    id: m.id,
    competition: { id: m.competition.id, name: m.competition.name, type: m.competition.type },
    utcDate: m.utcDate,
    stage: m.stage,
    homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name, tla: m.homeTeam.tla },
    awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name, tla: m.awayTeam.tla },
    score: {
      fullTime: m.score.fullTime,
      halfTime: m.score.halfTime,
      winner: m.score.winner,
    },
  }));

  const outPath = path.join(OUT_DIR, `${tla.toLowerCase()}.json`);
  await fse.writeJson(outPath, { teamId, tla, count: matches.length, matches }, { spaces: 2 });
  return matches;
}

async function fetchAllTeamMatches() {
  // Charge la liste des équipes déjà récupérée
  const teamsFile = path.join(__dirname, '../data/teams/teams.json');
  if (!fse.existsSync(teamsFile)) {
    console.error('❌  data/teams/teams.json introuvable — lancez d\'abord fetch-teams.js');
    process.exit(1);
  }
  const { teams } = await fse.readJson(teamsFile);

  console.log(`\n📋  Récupération de l'historique récent pour ${teams.length} équipes…`);
  await fse.ensureDir(OUT_DIR);

  for (const team of teams) {
    process.stdout.write(`   ${team.tla.padEnd(4)} … `);
    const matches = await fetchTeamRecentMatches(team.id, team.tla);
    console.log(`${matches.length} matchs`);
  }
  console.log('✅  Historiques récents sauvegardés dans data/matches/');
}

async function main() {
  await fetchTournamentMatches();
  await fetchAllTeamMatches();
}

if (require.main === module) {
  main().catch((err) => { console.error('❌', err.message); process.exit(1); });
}

module.exports = { fetchTournamentMatches, fetchTeamRecentMatches };
