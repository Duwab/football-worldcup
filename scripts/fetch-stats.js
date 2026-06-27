/**
 * Calcule des statistiques agrégées par équipe à partir des matchs récupérés
 * Sorties :
 *   data/stats/[team-tla].json   — stats détaillées par équipe
 *   data/stats/summary.json      — résumé comparatif de toutes les équipes
 */
require('dotenv').config();
const fse = require('fs-extra');
const path = require('path');

const MATCHES_DIR = path.join(__dirname, '../data/matches');
const TEAMS_FILE = path.join(__dirname, '../data/teams/teams.json');
const OUT_DIR = path.join(__dirname, '../data/stats');

function computeStats(matches, teamId) {
  const stats = {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    cleanSheets: 0,
    failedToScore: 0,
    form: [],             // 5 derniers résultats : W/D/L
    avgGoalsFor: 0,
    avgGoalsAgainst: 0,
    winRate: 0,
    homeRecord: { played: 0, won: 0, drawn: 0, lost: 0 },
    awayRecord: { played: 0, won: 0, drawn: 0, lost: 0 },
    bigWins: [],          // victoires avec 3+ buts d'écart
    bigLosses: [],        // défaites avec 3+ buts d'écart
  };

  const finished = matches.filter((m) => m.status === 'FINISHED' || m.score?.fullTime?.home !== null);

  for (const m of finished) {
    const isHome = m.homeTeam.id === teamId;
    const gFor = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const gAgainst = isHome ? m.score.fullTime.away : m.score.fullTime.home;

    if (gFor === null || gAgainst === null) continue;

    stats.played++;
    stats.goalsFor += gFor;
    stats.goalsAgainst += gAgainst;
    if (gAgainst === 0) stats.cleanSheets++;
    if (gFor === 0) stats.failedToScore++;

    const record = isHome ? stats.homeRecord : stats.awayRecord;
    record.played++;

    let result;
    if (gFor > gAgainst) { stats.won++; record.won++; result = 'W'; }
    else if (gFor === gAgainst) { stats.drawn++; record.drawn++; result = 'D'; }
    else { stats.lost++; record.lost++; result = 'L'; }

    stats.form.push(result);

    const diff = Math.abs(gFor - gAgainst);
    if (diff >= 3) {
      const entry = {
        date: m.utcDate,
        opponent: isHome ? m.awayTeam.name : m.homeTeam.name,
        score: isHome ? `${gFor}-${gAgainst}` : `${gFor}-${gAgainst}`,
      };
      if (result === 'W') stats.bigWins.push(entry);
      if (result === 'L') stats.bigLosses.push(entry);
    }
  }

  stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
  stats.form = stats.form.slice(-5);
  stats.avgGoalsFor = stats.played ? +(stats.goalsFor / stats.played).toFixed(2) : 0;
  stats.avgGoalsAgainst = stats.played ? +(stats.goalsAgainst / stats.played).toFixed(2) : 0;
  stats.winRate = stats.played ? +(stats.won / stats.played * 100).toFixed(1) : 0;

  return stats;
}

async function buildStats() {
  console.log('\n📈  Calcul des statistiques par équipe…');

  if (!fse.existsSync(TEAMS_FILE)) {
    console.error('❌  data/teams/teams.json introuvable — lancez fetch-teams.js');
    process.exit(1);
  }

  const { teams } = await fse.readJson(TEAMS_FILE);
  await fse.ensureDir(OUT_DIR);

  const summary = [];

  for (const team of teams) {
    const matchFile = path.join(MATCHES_DIR, `${team.tla.toLowerCase()}.json`);
    if (!fse.existsSync(matchFile)) {
      console.warn(`   ⚠️  Pas de fichier de matchs pour ${team.tla}, ignoré`);
      continue;
    }

    const { matches } = await fse.readJson(matchFile);
    const stats = computeStats(matches, team.id);

    const teamStats = {
      team: { id: team.id, name: team.name, tla: team.tla, area: team.area },
      computedAt: new Date().toISOString(),
      recentMatches: matches.length,
      stats,
    };

    const outPath = path.join(OUT_DIR, `${team.tla.toLowerCase()}.json`);
    await fse.writeJson(outPath, teamStats, { spaces: 2 });

    summary.push({
      tla: team.tla,
      name: team.name,
      played: stats.played,
      won: stats.won,
      drawn: stats.drawn,
      lost: stats.lost,
      goalsFor: stats.goalsFor,
      goalsAgainst: stats.goalsAgainst,
      goalDifference: stats.goalDifference,
      winRate: stats.winRate,
      avgGoalsFor: stats.avgGoalsFor,
      avgGoalsAgainst: stats.avgGoalsAgainst,
      cleanSheets: stats.cleanSheets,
      form: stats.form.join(''),
    });

    process.stdout.write(`   ✓ ${team.tla}\n`);
  }

  // Trie par winRate décroissant
  summary.sort((a, b) => b.winRate - a.winRate);
  await fse.writeJson(path.join(OUT_DIR, 'summary.json'), {
    computedAt: new Date().toISOString(),
    count: summary.length,
    teams: summary,
  }, { spaces: 2 });

  console.log(`\n✅  Stats calculées pour ${summary.length} équipes → data/stats/`);
}

if (require.main === module) {
  buildStats().catch((err) => { console.error('❌', err.message); process.exit(1); });
}

module.exports = { buildStats };
