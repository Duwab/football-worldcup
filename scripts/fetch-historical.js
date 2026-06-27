/**
 * Récupère l'historique complet des matchs internationaux depuis GitHub (martj42/international_results).
 * Sources :
 *   results.csv     → tous les scores depuis 1872
 *   goalscorers.csv → buteurs par match
 *   shootouts.csv   → résultats aux tirs au but
 *
 * Sorties :
 *   data/historical/[team-slug].json   — historique complet par équipe
 *   data/historical/index.json         — résumé comparatif de toutes les équipes
 */
require('dotenv').config();
const axios = require('axios');
const fse = require('fs-extra');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { toDatasetName, normalize } = require('./team-names');

const YEARS_BACK = parseInt(process.env.HISTORY_YEARS || '20', 10);
const OUT_DIR = path.join(__dirname, '../data/historical');

const GITHUB_BASE = 'https://raw.githubusercontent.com/martj42/international_results/master';

// ─── Classification des tournois ─────────────────────────────────────────────

const TOURNAMENT_RULES = [
  // Coupe du Monde
  { match: /^FIFA World Cup$/i,                        cat: 'world_cup' },
  { match: /World Cup qualif/i,                        cat: 'world_cup_qualifier' },

  // Tournois continentaux finaux
  { match: /UEFA Euro(?:pean Championship)?$/i,        cat: 'continental' },
  { match: /Copa Am[eé]rica/i,                         cat: 'continental' },
  { match: /Africa Cup of Nations$/i,                  cat: 'continental' },
  { match: /AFCON$/i,                                  cat: 'continental' },
  { match: /AFC Asian Cup$/i,                          cat: 'continental' },
  { match: /CONCACAF Gold Cup/i,                       cat: 'continental' },
  { match: /CONCACAF Championship$/i,                  cat: 'continental' },
  { match: /OFC Nations Cup/i,                         cat: 'continental' },
  { match: /Confederations Cup/i,                      cat: 'continental' },
  { match: /Arab Cup/i,                                cat: 'continental' },
  { match: /COSAFA Cup/i,                              cat: 'continental' },
  { match: /CECAFA/i,                                  cat: 'continental' },
  { match: /WAFU/i,                                    cat: 'continental' },

  // Qualifications continentales
  { match: /UEFA Euro.*qualif/i,                       cat: 'continental_qualifier' },
  { match: /Africa Cup.*qualif/i,                      cat: 'continental_qualifier' },
  { match: /AFC Asian Cup.*qualif/i,                   cat: 'continental_qualifier' },
  { match: /CONCACAF.*qualif/i,                        cat: 'continental_qualifier' },
  { match: /Copa Am[eé]rica.*qualif/i,                 cat: 'continental_qualifier' },
  { match: /OFC.*qualif/i,                             cat: 'continental_qualifier' },
  { match: /qualif/i,                                  cat: 'continental_qualifier' },

  // Ligue des Nations
  { match: /UEFA Nations League/i,                     cat: 'nations_league' },
  { match: /CONCACAF Nations League/i,                 cat: 'nations_league' },
  { match: /CONMEBOL.*Nations/i,                       cat: 'nations_league' },
  { match: /Nations League/i,                          cat: 'nations_league' },

  // Amicaux
  { match: /^Friendly$/i,                              cat: 'friendly' },
];

function classifyTournament(name) {
  for (const rule of TOURNAMENT_RULES) {
    if (rule.match.test(name)) return rule.cat;
  }
  return 'other';
}

// ─── Téléchargement CSV ───────────────────────────────────────────────────────

async function downloadCsv(filename) {
  const url = `${GITHUB_BASE}/${filename}`;
  process.stdout.write(`   Téléchargement ${filename} … `);
  const res = await axios.get(url, { responseType: 'text', timeout: 30000 });
  const rows = parse(res.data, { columns: true, skip_empty_lines: true });
  console.log(`${rows.length} lignes`);
  return rows;
}

// ─── Traitement des données ───────────────────────────────────────────────────

function buildTeamIndex(results, teamsMap) {
  // teamsMap: datasetName → { id, name, tla, area }
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - YEARS_BACK);

  const byTeam = new Map(); // datasetName → []

  for (const row of results) {
    const date = new Date(row.date);
    if (date < cutoff) continue;

    const { home_team, away_team } = row;

    for (const side of ['home', 'away']) {
      const teamName = side === 'home' ? home_team : away_team;
      if (!teamsMap.has(teamName)) continue;

      if (!byTeam.has(teamName)) byTeam.set(teamName, []);
      byTeam.get(teamName).push({
        date: row.date,
        home: home_team,
        away: away_team,
        homeScore: parseInt(row.home_score, 10),
        awayScore: parseInt(row.away_score, 10),
        tournament: row.tournament,
        category: classifyTournament(row.tournament),
        city: row.city,
        country: row.country,
        neutral: row.neutral === 'True',
      });
    }
  }

  return byTeam;
}

function buildGoalscorerIndex(goalscorers) {
  // date+home+away → [{ team, scorer, ownGoal, penalty }]
  const index = new Map();
  for (const row of goalscorers) {
    const key = `${row.date}|${row.home_team}|${row.away_team}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({
      team: row.team,
      scorer: row.scorer,
      minute: row.minute || null,
      ownGoal: row.own_goal === 'True',
      penalty: row.penalty === 'True',
    });
  }
  return index;
}

function buildShootoutIndex(shootouts) {
  const index = new Map();
  for (const row of shootouts) {
    const key = `${row.date}|${row.home_team}|${row.away_team}`;
    index.set(key, { winner: row.winner, firstShooter: row.first_shooter });
  }
  return index;
}

function computeTeamStats(matches, teamDatasetName) {
  const stats = {
    total:    initRecord(),
    world_cup: initRecord(),
    world_cup_qualifier: initRecord(),
    continental: initRecord(),
    continental_qualifier: initRecord(),
    nations_league: initRecord(),
    friendly: initRecord(),
    other: initRecord(),
  };

  for (const m of matches) {
    const isHome = m.home === teamDatasetName;
    const gFor = isHome ? m.homeScore : m.awayScore;
    const gAgt = isHome ? m.awayScore : m.homeScore;

    if (isNaN(gFor) || isNaN(gAgt)) continue;

    const cat = m.category;
    const result = gFor > gAgt ? 'W' : gFor === gAgt ? 'D' : 'L';

    for (const key of ['total', cat]) {
      if (!stats[key]) stats[key] = initRecord();
      const r = stats[key];
      r.played++;
      r.goalsFor += gFor;
      r.goalsAgainst += gAgt;
      if (result === 'W') r.won++;
      else if (result === 'D') r.drawn++;
      else r.lost++;
      if (gAgt === 0) r.cleanSheets++;
      if (gFor === 0) r.failedToScore++;
    }
  }

  // Calcul des ratios
  for (const key of Object.keys(stats)) {
    const r = stats[key];
    r.goalDifference = r.goalsFor - r.goalsAgainst;
    r.winRate = r.played ? +(r.won / r.played * 100).toFixed(1) : 0;
    r.avgGoalsFor = r.played ? +(r.goalsFor / r.played).toFixed(2) : 0;
    r.avgGoalsAgainst = r.played ? +(r.goalsAgainst / r.played).toFixed(2) : 0;
  }

  return stats;
}

function initRecord() {
  return { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, cleanSheets: 0, failedToScore: 0, winRate: 0, avgGoalsFor: 0, avgGoalsAgainst: 0 };
}

function computeTopScorers(matches, goalsIndex, teamDatasetName, limit = 20) {
  const scorerMap = new Map();

  for (const m of matches) {
    const key = `${m.date}|${m.home}|${m.away}`;
    const goals = goalsIndex.get(key) || [];
    for (const g of goals) {
      if (g.team !== teamDatasetName) continue;
      if (g.ownGoal) continue;
      const name = g.scorer;
      if (!scorerMap.has(name)) scorerMap.set(name, { name, goals: 0, penalties: 0 });
      scorerMap.get(name).goals++;
      if (g.penalty) scorerMap.get(name).penalties++;
    }
  }

  return [...scorerMap.values()]
    .sort((a, b) => b.goals - a.goals)
    .slice(0, limit);
}

function getRecentForm(matches, teamDatasetName, n = 10) {
  const finished = matches
    .filter((m) => !isNaN(m.homeScore) && !isNaN(m.awayScore))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, n);

  return finished.map((m) => {
    const isHome = m.home === teamDatasetName;
    const gFor = isHome ? m.homeScore : m.awayScore;
    const gAgt = isHome ? m.awayScore : m.homeScore;
    const result = gFor > gAgt ? 'W' : gFor === gAgt ? 'D' : 'L';
    return {
      date: m.date,
      opponent: isHome ? m.away : m.home,
      venue: m.neutral ? 'neutral' : isHome ? 'home' : 'away',
      score: `${gFor}-${gAgt}`,
      result,
      tournament: m.tournament,
      category: m.category,
    };
  });
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────

async function fetchHistorical() {
  const teamsFile = path.join(__dirname, '../data/teams/teams.json');
  if (!fse.existsSync(teamsFile)) {
    console.error('❌  data/teams/teams.json introuvable — lancez fetch-teams.js d\'abord');
    process.exit(1);
  }
  const { teams } = await fse.readJson(teamsFile);

  console.log(`\n📚  Historique international (${YEARS_BACK} dernières années)\n`);

  // Téléchargement des 3 CSV
  const [results, goalscorers, shootouts] = await Promise.all([
    downloadCsv('results.csv'),
    downloadCsv('goalscorers.csv'),
    downloadCsv('shootouts.csv'),
  ]);

  // Construit les index
  const goalsIndex = buildGoalscorerIndex(goalscorers);
  const shootoutIndex = buildShootoutIndex(shootouts);

  // Mappe les noms football-data → noms dataset
  const teamsMap = new Map();  // datasetName → team object
  const unmapped = [];

  for (const t of teams) {
    const datasetName = toDatasetName(t.name);
    teamsMap.set(datasetName, { ...t, datasetName });
  }

  // Vérifie lesquels existent vraiment dans le dataset
  const datasetTeamNames = new Set([
    ...results.map((r) => r.home_team),
    ...results.map((r) => r.away_team),
  ]);

  for (const [dsName, team] of teamsMap) {
    if (!datasetTeamNames.has(dsName)) {
      unmapped.push({ fdName: team.name, dsName });
      // Tente une correspondance approximative
      const normDs = normalize(dsName);
      const found = [...datasetTeamNames].find((n) => normalize(n) === normDs);
      if (found) {
        console.warn(`   ⚠️  Correspondance approximative : "${dsName}" → "${found}"`);
        teamsMap.delete(dsName);
        teamsMap.set(found, { ...team, datasetName: found });
      }
    }
  }

  if (unmapped.length > 0) {
    console.warn(`\n   ⚠️  Équipes non trouvées dans le dataset :`);
    unmapped.forEach(({ fdName, dsName }) =>
      console.warn(`      "${fdName}" (cherché: "${dsName}")`)
    );
    console.warn('   → Ajoutez-les dans scripts/team-names.js\n');
  }

  // Indexe les matchs par équipe
  const byTeam = buildTeamIndex(results, teamsMap);

  await fse.ensureDir(OUT_DIR);

  const summary = [];
  const cutoffYear = new Date().getFullYear() - YEARS_BACK;

  console.log(`\n📝  Génération des fichiers par équipe…\n`);

  for (const [datasetName, teamMeta] of teamsMap) {
    const matches = (byTeam.get(datasetName) || [])
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const stats = computeTeamStats(matches, datasetName);
    const topScorers = computeTopScorers(matches, goalsIndex, datasetName);
    const recentForm = getRecentForm(matches, datasetName);

    // Enrichit chaque match avec shootout + buteurs
    const enrichedMatches = matches.map((m) => {
      const key = `${m.date}|${m.home}|${m.away}`;
      const shootout = shootoutIndex.get(key) || null;
      const goals = (goalsIndex.get(key) || []);
      return { ...m, shootout, goals };
    });

    const output = {
      team: { id: teamMeta.id, name: teamMeta.name, tla: teamMeta.tla, datasetName, area: teamMeta.area },
      period: { from: `${cutoffYear}-01-01`, to: new Date().toISOString().split('T')[0] },
      fetchedAt: new Date().toISOString(),
      stats,
      recentForm,
      topScorers,
      matchCount: matches.length,
      matches: enrichedMatches,
    };

    const slug = teamMeta.tla.toLowerCase();
    await fse.writeJson(path.join(OUT_DIR, `${slug}.json`), output, { spaces: 2 });

    summary.push({
      tla: teamMeta.tla,
      name: teamMeta.name,
      datasetName,
      matchCount: matches.length,
      stats: stats.total,
      worldCupStats: stats.world_cup,
      continentalStats: stats.continental,
      competitiveStats: mergeRecords([stats.world_cup, stats.world_cup_qualifier, stats.continental, stats.continental_qualifier, stats.nations_league]),
      recentForm: recentForm.slice(0, 5).map((m) => m.result).join(''),
    });

    process.stdout.write(`   ✓ ${teamMeta.tla.padEnd(4)} — ${matches.length} matchs\n`);
  }

  summary.sort((a, b) => b.stats.winRate - a.stats.winRate);
  await fse.writeJson(path.join(OUT_DIR, 'index.json'), {
    fetchedAt: new Date().toISOString(),
    period: `${cutoffYear}–${new Date().getFullYear()}`,
    yearsBack: YEARS_BACK,
    teamCount: summary.length,
    teams: summary,
  }, { spaces: 2 });

  console.log(`\n✅  Historique généré pour ${summary.length} équipes → data/historical/`);
}

function mergeRecords(records) {
  const merged = initRecord();
  for (const r of records) {
    merged.played += r.played;
    merged.won += r.won;
    merged.drawn += r.drawn;
    merged.lost += r.lost;
    merged.goalsFor += r.goalsFor;
    merged.goalsAgainst += r.goalsAgainst;
    merged.cleanSheets += r.cleanSheets;
    merged.failedToScore += r.failedToScore;
  }
  merged.goalDifference = merged.goalsFor - merged.goalsAgainst;
  merged.winRate = merged.played ? +(merged.won / merged.played * 100).toFixed(1) : 0;
  merged.avgGoalsFor = merged.played ? +(merged.goalsFor / merged.played).toFixed(2) : 0;
  merged.avgGoalsAgainst = merged.played ? +(merged.goalsAgainst / merged.played).toFixed(2) : 0;
  return merged;
}

if (require.main === module) {
  fetchHistorical().catch((err) => { console.error('❌', err.message); process.exit(1); });
}

module.exports = { fetchHistorical };
