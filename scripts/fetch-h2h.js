/**
 * Construit les historiques face-à-face (H2H) entre équipes d'un même groupe WC 2026
 * à partir des matchs de chaque équipe déjà récupérés.
 * Sortie : data/h2h/[tla1]-vs-[tla2].json  (tla1 < tla2 alphabétiquement)
 */
require('dotenv').config();
const fse = require('fs-extra');
const path = require('path');

const MATCHES_DIR = path.join(__dirname, '../data/matches');
const STANDINGS_FILE = path.join(__dirname, '../data/standings/groups.json');
const OUT_DIR = path.join(__dirname, '../data/h2h');

function h2hKey(tla1, tla2) {
  return [tla1, tla2].sort().join('-vs-').toLowerCase();
}

function buildH2H(matchesA, matchesB, teamA, teamB) {
  // Combine et déduplique par match ID
  const byId = new Map();
  [...matchesA, ...matchesB].forEach((m) => byId.set(m.id, m));

  const shared = [...byId.values()].filter((m) =>
    (m.homeTeam.id === teamA.id || m.awayTeam.id === teamA.id) &&
    (m.homeTeam.id === teamB.id || m.awayTeam.id === teamB.id)
  );

  const stats = { played: 0, teamAWins: 0, draws: 0, teamBWins: 0, goalsA: 0, goalsB: 0 };

  const meetings = shared.map((m) => {
    const aIsHome = m.homeTeam.id === teamA.id;
    const gA = aIsHome ? m.score.fullTime.home : m.score.fullTime.away;
    const gB = aIsHome ? m.score.fullTime.away : m.score.fullTime.home;

    if (gA !== null && gB !== null) {
      stats.played++;
      stats.goalsA += gA;
      stats.goalsB += gB;
      if (gA > gB) stats.teamAWins++;
      else if (gA === gB) stats.draws++;
      else stats.teamBWins++;
    }

    return {
      id: m.id,
      date: m.utcDate,
      competition: m.competition?.name ?? 'Unknown',
      home: m.homeTeam.name,
      away: m.awayTeam.name,
      score: `${m.score.fullTime.home}-${m.score.fullTime.away}`,
      winner: m.score.winner,
    };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  return { teamA, teamB, stats, meetings };
}

async function fetchH2H() {
  console.log('\n🔁  Construction des historiques H2H par groupe…');

  if (!fse.existsSync(STANDINGS_FILE)) {
    console.error('❌  data/standings/groups.json introuvable — lancez fetch-standings.js');
    process.exit(1);
  }

  const { groups } = await fse.readJson(STANDINGS_FILE);
  await fse.ensureDir(OUT_DIR);

  let count = 0;

  for (const group of groups) {
    const teams = group.table.map((row) => row.team);
    console.log(`   Groupe ${group.group} : ${teams.map((t) => t.tla).join(', ')}`);

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const tA = teams[i];
        const tB = teams[j];

        const fileA = path.join(MATCHES_DIR, `${tA.tla.toLowerCase()}.json`);
        const fileB = path.join(MATCHES_DIR, `${tB.tla.toLowerCase()}.json`);

        if (!fse.existsSync(fileA) || !fse.existsSync(fileB)) {
          console.warn(`   ⚠️  Fichiers matchs manquants pour ${tA.tla} ou ${tB.tla}`);
          continue;
        }

        const { matches: matchesA } = await fse.readJson(fileA);
        const { matches: matchesB } = await fse.readJson(fileB);

        const h2h = buildH2H(matchesA, matchesB, tA, tB);
        const key = h2hKey(tA.tla, tB.tla);
        const outPath = path.join(OUT_DIR, `${key}.json`);

        await fse.writeJson(outPath, {
          ...h2h,
          computedAt: new Date().toISOString(),
        }, { spaces: 2 });

        count++;
      }
    }
  }

  console.log(`✅  ${count} fichiers H2H générés → data/h2h/`);
}

if (require.main === module) {
  fetchH2H().catch((err) => { console.error('❌', err.message); process.exit(1); });
}

module.exports = { fetchH2H };
