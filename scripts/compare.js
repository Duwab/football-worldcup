/**
 * Génère un rapport markdown comparatif entre 2 équipes.
 * Usage : node scripts/compare.js <TLA1> <TLA2> [--limit <n>] [--all] [--output <chemin>]
 * Sortie : data/reports/<tla1>-vs-<tla2>.md
 */
const fse = require('fs-extra');
const path = require('path');

const DATA = path.join(__dirname, '../data');

// ─── Formatage ────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtResult(r) {
  return { W: '✅ Victoire', D: '🟡 Nul', L: '❌ Défaite' }[r] ?? r;
}

function fmtVenue(isHome, neutral) {
  if (neutral) return '⚖️ Neutre';
  return isHome ? '🏠 Domicile' : '✈️ Extérieur';
}

const CATEGORY_LABELS = {
  world_cup:              '⚽ Coupe du Monde',
  world_cup_qualifier:    '🔵 Qual. Coupe du Monde',
  nations_league:         '🌍 Ligue des Nations',
  friendly:               '🤝 Amical',
};
const CATEGORY_ICONS = {
  continental:            '🏆',
  continental_qualifier:  '🔵',
  other:                  '⚡',
};

function fmtContext(category, tournament) {
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
  const icon = CATEGORY_ICONS[category] ?? '⚡';
  return `${icon} ${tournament}`;
}

function fmtScore(match, teamName) {
  const isHome = match.home === teamName;
  const gFor  = isHome ? match.homeScore : match.awayScore;
  const gAgt  = isHome ? match.awayScore : match.homeScore;

  let out = `**${gFor}–${gAgt}**`;
  if (match.shootout) out += ` a.p. *(t.a.b. : ${match.shootout.winner})*`;

  if (match.goals?.length > 0) {
    const mine = match.goals.filter(g => g.team === teamName && !g.ownGoal);
    const csc  = match.goals.filter(g => g.team !== teamName && g.ownGoal);
    const all  = [...mine, ...csc];
    if (all.length) {
      const str = all.map(g =>
        `${g.scorer}${g.minute ? ` ${g.minute}'` : ''}` +
        (g.penalty ? ' (pen.)' : '') +
        (g.ownGoal ? ' (csc)' : '')
      ).join(', ');
      out += ` *${str}*`;
    }
  }
  return out;
}

function matchResult(m, teamName) {
  const isHome = m.home === teamName;
  const gFor  = isHome ? m.homeScore : m.awayScore;
  const gAgt  = isHome ? m.awayScore : m.homeScore;
  return gFor > gAgt ? 'W' : gFor < gAgt ? 'L' : 'D';
}

function pct(val) { return `${val}%`; }
function sign(n)  { return n >= 0 ? `+${n}` : `${n}`; }

// ─── Calcul dynamique des stats sur un sous-ensemble de matchs ────────────────

const COMPETITIVE_CATS = ['world_cup', 'world_cup_qualifier', 'continental', 'continental_qualifier', 'nations_league'];

function emptyRecord() {
  return { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, cleanSheets: 0, winRate: 0, avgGoalsFor: 0, avgGoalsAgainst: 0 };
}

function finalise(r) {
  r.goalDifference  = r.goalsFor - r.goalsAgainst;
  r.winRate         = r.played ? +((r.won / r.played) * 100).toFixed(1) : 0;
  r.avgGoalsFor     = r.played ? +(r.goalsFor / r.played).toFixed(2) : 0;
  r.avgGoalsAgainst = r.played ? +(r.goalsAgainst / r.played).toFixed(2) : 0;
  return r;
}

function computeStatsFromMatches(matches, teamName) {
  const s = {
    total: emptyRecord(), world_cup: emptyRecord(), world_cup_qualifier: emptyRecord(),
    continental: emptyRecord(), continental_qualifier: emptyRecord(),
    nations_league: emptyRecord(), friendly: emptyRecord(), other: emptyRecord(),
  };

  for (const m of matches) {
    if (m.homeScore === null || m.awayScore === null) continue;
    const isHome = m.home === teamName;
    const gFor   = isHome ? m.homeScore : m.awayScore;
    const gAgt   = isHome ? m.awayScore : m.homeScore;
    const cat    = m.category ?? 'other';

    for (const key of ['total', cat]) {
      if (!s[key]) s[key] = emptyRecord();
      const r = s[key];
      r.played++;
      r.goalsFor      += gFor;
      r.goalsAgainst  += gAgt;
      if (gFor > gAgt) r.won++;
      else if (gFor === gAgt) r.drawn++;
      else r.lost++;
      if (gAgt === 0) r.cleanSheets++;
    }
  }

  // Compétitifs = toutes catégories sauf amicaux / other
  const cmp = emptyRecord();
  for (const c of COMPETITIVE_CATS) {
    const r = s[c];
    cmp.played       += r.played;
    cmp.won          += r.won;
    cmp.drawn        += r.drawn;
    cmp.lost         += r.lost;
    cmp.goalsFor     += r.goalsFor;
    cmp.goalsAgainst += r.goalsAgainst;
    cmp.cleanSheets  += r.cleanSheets;
  }
  s.competitive = cmp;

  for (const key of Object.keys(s)) finalise(s[key]);
  return s;
}

// ─── Parcours en Coupe du Monde ───────────────────────────────────────────────

// Toutes les éditions de la Coupe du Monde
const ALL_WC_YEARS = [1930,1934,1938,1950,1954,1958,1962,1966,1970,1974,1978,1982,1986,1990,1994,1998,2002,2006,2010,2014,2018,2022,2026];

// Format 48 équipes à partir de 2026 (round of 32 supplémentaire)
const IS_48_TEAM = year => year >= 2026;

function wonMatch(m, teamName) {
  const isHome = m.home === teamName;
  const gFor   = isHome ? m.homeScore : m.awayScore;
  const gAgt   = isHome ? m.awayScore : m.homeScore;
  return gFor > gAgt || m.shootout?.winner === teamName;
}

function getWCStage(allMatches, teamName, year) {
  const isThisWC = m => m.category === 'world_cup' && m.date.slice(0, 4) === String(year);

  const finished = allMatches
    .filter(m => isThisWC(m) && m.homeScore !== null && m.awayScore !== null)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const hasPending = allMatches.some(m => isThisWC(m) && m.homeScore === null);

  if (finished.length === 0) return hasPending ? '⏳' : null;

  const n    = finished.length;
  const is48 = IS_48_TEAM(year);
  const wonM = m => wonMatch(m, teamName);

  // Détecte si la phase de groupes est absente de nos données.
  // On compare la date du premier match disponible au seuil de fin de poules,
  // adapté selon que le tournoi est estival (juin-juil.) ou hivernal (Qatar 2022).
  const avgMonth = finished.reduce((s, m) => s + new Date(m.date).getMonth(), 0) / n;
  const isWinterWC = avgMonth > 9; // moyenne des mois > octobre → hiver
  const groupsEndThreshold = new Date(isWinterWC ? `${year}-12-03` : `${year}-06-28`);
  const missingGroups = new Date(finished[0].date) >= groupsEndThreshold;

  // Détermine le stade final à partir des 2 derniers matchs disponibles
  // (demi-finale et finale/3e place)
  const inferFinalStage = () => {
    if (hasPending) return '⏳';
    if (n < 2) return wonM(finished[0]) ? '⏳' : 'Quarts de finale'; // 1 match = QF perdu
    const sf   = finished[n - 2];
    const last = finished[n - 1];
    if (wonM(sf)) return wonM(last) ? '🏆 Vainqueur' : 'Finaliste';
    return wonM(last) ? '3e place' : '4e place';
  };

  // ── Données partielles : phase de groupes hors fenêtre temporelle ─────────
  // Les matchs disponibles commencent aux quarts de finale ou plus tard.
  if (missingGroups) {
    if (!is48) {
      // n=1 → QF seul · n=2 → QF+SF · n>=3 → QF+SF+Finale/3e
      if (n >= 3) return inferFinalStage();
      if (n === 2) {
        if (!wonM(finished[0])) return 'Quarts de finale'; // perdu le QF
        if (hasPending) return '⏳ Demies';
        return wonM(finished[1]) ? '⏳' : 'Demi-finales';
      }
      return wonM(finished[0]) ? '⏳' : 'Quarts de finale';
    }
    // 48 équipes, même logique adaptée
    if (n >= 3) return inferFinalStage();
    return hasPending ? '⏳' : (wonM(finished[0]) ? '⏳' : 'Quarts de finale');
  }

  // ── Données complètes (phase de groupes présente) ─────────────────────────
  if (!is48) {
    // 32 équipes : 3=Poules · 4=8es · 5=Quarts · 6=Demies (en cours) · 7=Finale/3e
    if (n <= 3) return hasPending ? '⏳ Poules' : 'Poules';
    if (n === 4) return '8es de finale';
    if (n === 5) return 'Quarts de finale';
    if (n === 6) return hasPending ? '⏳ Demies' : 'Demi-finales';
    return inferFinalStage();
  }

  // 48 équipes : 3=Poules · 4=32es · 5=16es · 6=Quarts · 7=Demies (en cours) · 8=Finale/3e
  if (n <= 3) return hasPending ? '⏳ Poules' : 'Poules';
  if (n === 4) return '32es de finale';
  if (n === 5) return '16es de finale';
  if (n === 6) return 'Quarts de finale';
  if (n === 7) return hasPending ? '⏳ Demies' : 'Demi-finales';
  return inferFinalStage();
}

const STAGE_SORT = {
  '🏆 Vainqueur': 0, 'Finaliste': 1, '3e place': 2, '4e place': 3,
  'Demi-finales': 4, '⏳ Demies': 4,
  'Quarts de finale': 5, '16es de finale': 6, '32es de finale': 7,
  '8es de finale': 6, 'Poules': 8, '⏳ Poules': 8, '⏳': 9,
};

function stageEmoji(stage) {
  if (!stage || stage === '—') return '—';
  if (stage === '🏆 Vainqueur') return '🏆';
  if (stage === 'Finaliste')    return '🥈 Finaliste';
  if (stage === '3e place')     return '🥉 3e place';
  if (stage.startsWith('⏳'))   return stage;
  return stage;
}

function buildWCTableSection(histA, histB, teamA, teamB) {
  // Déterminer la fenêtre de données disponibles
  const firstYear = parseInt(histA.period.from.slice(0, 4));
  const lastYear  = parseInt(histA.period.to.slice(0, 4));

  // Éditions dans la fenêtre + au moins une équipe y a joué OU l'édition existe
  const yearsInWindow = ALL_WC_YEARS.filter(y => y >= firstYear && y <= lastYear);

  if (yearsInWindow.length === 0) return '';

  const stagesA = Object.fromEntries(yearsInWindow.map(y => [y, getWCStage(histA.matches, histA.team.datasetName, y)]));
  const stagesB = Object.fromEntries(yearsInWindow.map(y => [y, getWCStage(histB.matches, histB.team.datasetName, y)]));

  // N'afficher que les années où au moins une des deux équipes a des données
  const visibleYears = yearsInWindow.filter(y => stagesA[y] !== null || stagesB[y] !== null);

  if (visibleYears.length === 0) return '';

  const lines = [];
  lines.push('## 📅 Parcours en Coupe du Monde\n');
  lines.push(`*Données disponibles : ${firstYear}–${lastYear}*\n`);
  lines.push(`| Équipe | ${visibleYears.map(y => `**${y}**`).join(' | ')} |`);
  lines.push(`|:---|${visibleYears.map(() => ':---:').join('|')}|`);

  for (const [team, stages] of [[teamA, stagesA], [teamB, stagesB]]) {
    const cells = visibleYears.map(y => stageEmoji(stages[y] ?? '—'));
    lines.push(`| **${team.name}** | ${cells.join(' | ')} |`);
  }

  lines.push('');
  return lines.join('\n');
}

// ─── Section H2H ─────────────────────────────────────────────────────────────

function computeH2H(matchesA, nameA, nameB, options) {
  const { limit, showAll } = options;

  const all = matchesA
    .filter(m =>
      m.homeScore !== null && m.awayScore !== null &&
      (m.home === nameB || m.away === nameB)
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const meetings = showAll ? all : all.slice(0, limit);

  const total = { played: 0, winsA: 0, draws: 0, winsB: 0, goalsA: 0, goalsB: 0 };
  for (const m of meetings) {
    const isHome = m.home === nameA;
    const gA = isHome ? m.homeScore : m.awayScore;
    const gB = isHome ? m.awayScore : m.homeScore;
    total.played++;
    total.goalsA += gA;
    total.goalsB += gB;
    const w = gA > gB ? 'A' : gA < gB ? 'B' : 'D';
    total.winsA += w === 'A' ? 1 : 0;
    total.draws += w === 'D' ? 1 : 0;
    total.winsB += w === 'B' ? 1 : 0;
  }

  return { total, meetings, totalCount: all.length };
}

function buildH2HSection(h2h, teamA, teamB, options) {
  const { total, meetings, totalCount } = h2h;
  const { limit, showAll } = options;
  const lines = [];

  const yearRange = meetings.length
    ? `${meetings.at(-1).date.slice(0, 4)}–${meetings[0].date.slice(0, 4)}`
    : '—';

  const truncNote = (!showAll && meetings.length < totalCount)
    ? ` — *${meetings.length} sur ${totalCount} affichées*`
    : '';

  lines.push(`## ⚔️ Confrontations directes (${yearRange}${truncNote})\n`);

  if (!total.played) {
    lines.push('*Aucune rencontre dans la période analysée (20 ans).*\n');
    return lines.join('\n');
  }

  lines.push('### Bilan\n');
  lines.push(`| | **${teamA.name}** | Nuls | **${teamB.name}** |`);
  lines.push('|:---|:---:|:---:|:---:|');
  lines.push(`| Victoires | **${total.winsA}** | ${total.draws} | **${total.winsB}** |`);
  lines.push(`| Buts marqués | ${total.goalsA} | — | ${total.goalsB} |`);
  lines.push(`| Moyenne buts/match | ${(total.goalsA / total.played).toFixed(2)} | — | ${(total.goalsB / total.played).toFixed(2)} |`);
  lines.push('');
  lines.push('### Historique des rencontres\n');
  lines.push('| Date | Compétition | Lieu | Score | Vainqueur |');
  lines.push('|:---:|:---|:---:|:---:|:---:|');

  for (const m of meetings) {
    const isAHome = m.home === teamA.datasetName;
    const venue   = fmtVenue(isAHome, m.neutral);
    const score   = fmtScore(m, teamA.datasetName);
    const r       = matchResult(m, teamA.datasetName);
    const winner  = r === 'W' ? `✅ **${teamA.tla}**` : r === 'L' ? `✅ **${teamB.tla}**` : '🟡 Nul';
    lines.push(`| ${fmtDate(m.date)} | ${fmtContext(m.category, m.tournament)} | ${venue} | ${score} | ${winner} |`);
  }

  lines.push('');
  return lines.join('\n');
}

// ─── Section équipe individuelle ──────────────────────────────────────────────

function buildGoalDistributionTable(displayed, teamName) {
  const byGoals = {}; // goalsScored → { wins, draws, losses, matches[] }

  for (const m of displayed) {
    const isHome = m.home === teamName;
    const gFor   = isHome ? m.homeScore : m.awayScore;
    const gAgt   = isHome ? m.awayScore : m.homeScore;
    const opp    = isHome ? m.away : m.home;

    if (!byGoals[gFor]) byGoals[gFor] = { wins: 0, draws: 0, losses: 0, matches: [] };
    const g = byGoals[gFor];

    // Nuls hors t.a.b. : un match avec tir aux buts compte comme V ou D
    let result;
    if (m.shootout) {
      result = m.shootout.winner === teamName ? 'W' : 'L';
    } else {
      result = gFor > gAgt ? 'W' : gFor === gAgt ? 'D' : 'L';
    }

    if      (result === 'W') g.wins++;
    else if (result === 'D') g.draws++;
    else                     g.losses++;

    const icon = result === 'W' ? '✅' : result === 'D' ? '🟡' : '❌';
    const pso  = m.shootout ? ' t.a.b.' : '';
    g.matches.push(`${icon} ${opp} (${gFor}-${gAgt}${pso})`);
  }

  const rows = Object.keys(byGoals).map(Number).sort((a, b) => a - b);
  if (!rows.length) return '';

  const lines = [];
  lines.push('### Distribution par buts marqués\n');
  lines.push('| Buts | ✅ V | 🟡 N | ❌ D | Matchs |');
  lines.push('|:---:|---:|---:|---:|:---|');
  for (const g of rows) {
    const { wins, draws, losses, matches } = byGoals[g];
    lines.push(`| **${g}** | ${wins} | ${draws} | ${losses} | ${matches.join(', ')} |`);
  }
  return lines.join('\n') + '\n';
}

function buildTeamSection(meta, hist, rank, options) {
  const { limit, showAll } = options;
  const teamName = hist.team.datasetName;
  const lines    = [];

  // Sélection des matchs affichés — base de toutes les stats du rapport
  const finished  = hist.matches.filter(m => m.homeScore !== null && m.awayScore !== null);
  const displayed = showAll ? finished : finished.slice(0, limit);
  const truncNote = (!showAll && displayed.length < finished.length)
    ? ` *(${displayed.length} sur ${finished.length} — ajouter \`--all\` pour tout afficher)*`
    : '';

  // Stats recalculées sur les matchs affichés
  const s = computeStatsFromMatches(displayed, teamName);

  lines.push(`## ${meta.name}\n`);

  // Infos de base
  lines.push('### Vue d\'ensemble\n');
  const infos = [
    meta.coach   ? `**Sélectionneur :** ${meta.coach}` : null,
    meta.founded ? `**Fondée :** ${meta.founded}` : null,
    `**Rang WC 2026 (win rate sur 20 ans) :** #${rank + 1} / 48`,
  ].filter(Boolean);
  infos.forEach(l => lines.push(l + '  '));
  lines.push('');

  // Tableau de stats sur les matchs sélectionnés
  const period = displayed.length
    ? `${displayed.at(-1).date.slice(0, 4)}–${displayed[0].date.slice(0, 4)}`
    : '—';
  lines.push(`*Statistiques sur les ${displayed.length} matchs affichés (${period})*\n`);
  lines.push('| Statistique | Tous matchs | Compétitifs | Coupe du Monde | Continental |');
  lines.push('|:---|---:|---:|---:|---:|');

  const cmp = s.competitive;
  const wc  = s.world_cup;
  const con = s.continental;

  lines.push(`| **Matchs joués**          | ${s.total.played}  | ${cmp.played}  | ${wc.played}  | ${con.played}  |`);
  lines.push(`| **Victoires**             | ${s.total.won} *(${pct(s.total.winRate)})*  | ${cmp.won} *(${pct(cmp.winRate)})*  | ${wc.won} *(${pct(wc.winRate)})*  | ${con.won} *(${pct(con.winRate)})*  |`);
  lines.push(`| **Nuls**                  | ${s.total.drawn}  | ${cmp.drawn}  | ${wc.drawn}  | ${con.drawn}  |`);
  lines.push(`| **Défaites**              | ${s.total.lost}  | ${cmp.lost}  | ${wc.lost}  | ${con.lost}  |`);
  lines.push(`| **Buts marqués**          | ${s.total.goalsFor}  | ${cmp.goalsFor}  | ${wc.goalsFor}  | ${con.goalsFor}  |`);
  lines.push(`| **Buts encaissés**        | ${s.total.goalsAgainst}  | ${cmp.goalsAgainst}  | ${wc.goalsAgainst}  | ${con.goalsAgainst}  |`);
  lines.push(`| **Différence de buts**    | ${sign(s.total.goalDifference)}  | ${sign(cmp.goalDifference)}  | ${sign(wc.goalDifference)}  | ${sign(con.goalDifference)}  |`);
  lines.push(`| **Feuilles blanches**     | ${s.total.cleanSheets}  | ${cmp.cleanSheets}  | ${wc.cleanSheets}  | ${con.cleanSheets}  |`);
  lines.push(`| **Moy. buts marqués**     | ${s.total.avgGoalsFor}  | ${cmp.avgGoalsFor}  | ${wc.avgGoalsFor}  | ${con.avgGoalsFor}  |`);
  lines.push(`| **Moy. buts encaissés**   | ${s.total.avgGoalsAgainst}  | ${cmp.avgGoalsAgainst}  | ${wc.avgGoalsAgainst}  | ${con.avgGoalsAgainst}  |`);
  lines.push('');

  lines.push(buildGoalDistributionTable(displayed, teamName));

  // Forme récente (toujours les 10 derniers, indépendant du filtre)
  const form = hist.recentForm.slice(0, 10);
  const fStr = form.map(m => m.result).join('');
  const fW   = form.filter(m => m.result === 'W').length;
  const fD   = form.filter(m => m.result === 'D').length;
  const fL   = form.filter(m => m.result === 'L').length;

  lines.push('### Forme récente (10 derniers matchs)\n');
  lines.push(`\`${fStr}\` → **${fW}V ${fD}N ${fL}D**\n`);
  lines.push('| # | Date | Adversaire | Lieu | Compétition | Score | Résultat |');
  lines.push('|:---:|:---:|:---|:---:|:---|:---:|:---:|');
  form.forEach((m, i) => {
    const venue = { home: '🏠 Domicile', away: '✈️ Extérieur', neutral: '⚖️ Neutre' }[m.venue] ?? m.venue;
    const [gF, gA] = m.score.split('-');
    lines.push(`| ${i + 1} | ${fmtDate(m.date)} | ${m.opponent} | ${venue} | ${fmtContext(m.category, m.tournament)} | **${gF}–${gA}** | ${fmtResult(m.result)} |`);
  });
  lines.push('');

  // Historique des matchs affichés
  lines.push(`### Historique des matchs${truncNote}\n`);
  lines.push('| Date | Adversaire | Lieu | Compétition | Score | Résultat |');
  lines.push('|:---:|:---|:---:|:---|:---:|:---:|');

  for (const m of displayed) {
    const isHome   = m.home === teamName;
    const opponent = isHome ? m.away : m.home;
    const venue    = fmtVenue(isHome, m.neutral);
    const score    = fmtScore(m, teamName);
    const r        = matchResult(m, teamName);
    lines.push(`| ${fmtDate(m.date)} | ${opponent} | ${venue} | ${fmtContext(m.category, m.tournament)} | ${score} | ${fmtResult(r)} |`);
  }

  lines.push('');
  return lines.join('\n');
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--');
  if (args.length < 2) {
    console.error('Usage : node scripts/compare.js <TLA1> <TLA2> [--limit <n>] [--all] [--output <chemin>]');
    process.exit(1);
  }

  const tla1    = args[0].toUpperCase();
  const tla2    = args[1].toUpperCase();
  const showAll = args.includes('--all');
  const limIdx  = args.indexOf('--limit');
  const limit   = limIdx !== -1 ? parseInt(args[limIdx + 1], 10) : 50;
  const outIdx  = args.indexOf('--output');
  const customOut = outIdx !== -1 ? args[outIdx + 1] : null;

  const [histA, histB, teamsData, idx] = await Promise.all([
    fse.readJson(path.join(DATA, `historical/${tla1.toLowerCase()}.json`)).catch(() => null),
    fse.readJson(path.join(DATA, `historical/${tla2.toLowerCase()}.json`)).catch(() => null),
    fse.readJson(path.join(DATA, 'teams/teams.json')),
    fse.readJson(path.join(DATA, 'historical/index.json')),
  ]);

  if (!histA) { console.error(`❌  Données historiques introuvables pour "${tla1}" — vérifiez le TLA ou lancez fetch:historical`); process.exit(1); }
  if (!histB) { console.error(`❌  Données historiques introuvables pour "${tla2}" — vérifiez le TLA ou lancez fetch:historical`); process.exit(1); }

  const metaA = teamsData.teams.find(t => t.tla === tla1) ?? { name: histA.team.name, tla: tla1 };
  const metaB = teamsData.teams.find(t => t.tla === tla2) ?? { name: histB.team.name, tla: tla2 };
  const rankA = idx.teams.findIndex(t => t.tla === tla1);
  const rankB = idx.teams.findIndex(t => t.tla === tla2);

  const opts = { limit, showAll };
  const h2h  = computeH2H(histA.matches, histA.team.datasetName, histB.team.datasetName, opts);

  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const wcTable = buildWCTableSection(histA, histB, metaA, metaB);

  const md = [
    `# ⚔️ ${metaA.name} vs ${metaB.name}`,
    '',
    `*Rapport généré le ${today} — Historique : ${idx.period}*`,
    '',
    '---',
    '',
    wcTable,
    wcTable ? '---\n' : '',
    buildH2HSection(
      h2h,
      { ...metaA, datasetName: histA.team.datasetName },
      { ...metaB, datasetName: histB.team.datasetName },
      opts
    ),
    '---',
    '',
    buildTeamSection(metaA, histA, rankA, opts),
    '---',
    '',
    buildTeamSection(metaB, histB, rankB, opts),
  ].join('\n');

  await fse.ensureDir(path.join(DATA, 'reports'));
  const outPath = customOut ?? path.join(DATA, `reports/${tla1.toLowerCase()}-vs-${tla2.toLowerCase()}.md`);
  await fse.writeFile(outPath, md);

  console.log(`✅  Rapport généré → ${outPath}`);
  console.log(`   H2H : ${h2h.total.played} rencontres | ${metaA.name} ${h2h.total.winsA}–${h2h.total.draws}–${h2h.total.winsB} ${metaB.name}`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
