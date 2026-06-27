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

// ─── Stats "compétitives" (toutes catégories sauf amicaux/autre) ──────────────

function mergeCompetitive(stats) {
  const cats = ['world_cup', 'world_cup_qualifier', 'continental', 'continental_qualifier', 'nations_league'];
  const merged = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 };
  for (const c of cats) {
    const s = stats[c];
    merged.played        += s.played;
    merged.won           += s.won;
    merged.drawn         += s.drawn;
    merged.lost          += s.lost;
    merged.goalsFor      += s.goalsFor;
    merged.goalsAgainst  += s.goalsAgainst;
    merged.cleanSheets   += s.cleanSheets;
  }
  merged.winRate         = merged.played ? +((merged.won / merged.played) * 100).toFixed(1) : 0;
  merged.avgGoalsFor     = merged.played ? +(merged.goalsFor / merged.played).toFixed(2) : 0;
  merged.avgGoalsAgainst = merged.played ? +(merged.goalsAgainst / merged.played).toFixed(2) : 0;
  merged.goalDifference  = merged.goalsFor - merged.goalsAgainst;
  return merged;
}

// ─── Section H2H ─────────────────────────────────────────────────────────────

function computeH2H(matchesA, nameA, nameB) {
  const meetings = matchesA
    .filter(m =>
      m.homeScore !== null && m.awayScore !== null &&
      (m.home === nameB || m.away === nameB)
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const total   = { played: 0, winsA: 0, draws: 0, winsB: 0, goalsA: 0, goalsB: 0 };
  const recent5 = { winsA: 0, draws: 0, winsB: 0 };

  meetings.forEach((m, i) => {
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
    if (i < 5) {
      recent5.winsA += w === 'A' ? 1 : 0;
      recent5.draws += w === 'D' ? 1 : 0;
      recent5.winsB += w === 'B' ? 1 : 0;
    }
  });

  return { total, recent5, meetings };
}

function buildH2HSection(h2h, teamA, teamB) {
  const { total, recent5, meetings } = h2h;
  const lines = [];

  const yearRange = meetings.length
    ? `${meetings.at(-1).date.slice(0, 4)}–${meetings[0].date.slice(0, 4)}`
    : '—';

  lines.push(`## ⚔️ Confrontations directes (${yearRange})\n`);

  if (!total.played) {
    lines.push('*Aucune rencontre dans la période analysée (20 ans).*\n');
    return lines.join('\n');
  }

  lines.push('### Bilan\n');
  lines.push(`| | **${teamA.name}** | Nuls | **${teamB.name}** |`);
  lines.push('|:---|:---:|:---:|:---:|');
  lines.push(`| Victoires — total | **${total.winsA}** | ${total.draws} | **${total.winsB}** |`);
  lines.push(`| Victoires — 5 derniers H2H | **${recent5.winsA}** | ${recent5.draws} | **${recent5.winsB}** |`);
  lines.push(`| Buts marqués | ${total.goalsA} | — | ${total.goalsB} |`);
  lines.push(`| Moyenne buts/match | ${total.played ? (total.goalsA / total.played).toFixed(2) : '—'} | — | ${total.played ? (total.goalsB / total.played).toFixed(2) : '—'} |`);
  lines.push('');
  lines.push('### Historique des rencontres\n');
  lines.push('| Date | Compétition | Lieu | Score | Vainqueur |');
  lines.push('|:---:|:---|:---:|:---:|:---:|');

  for (const m of meetings) {
    const neutral = m.neutral;
    const isAHome = m.home === teamA.datasetName;
    const venue   = fmtVenue(isAHome, neutral);
    const score   = fmtScore(m, teamA.datasetName);
    const r       = matchResult(m, teamA.datasetName);
    const winner  = r === 'W' ? `✅ **${teamA.tla}**` : r === 'L' ? `✅ **${teamB.tla}**` : '🟡 Nul';
    lines.push(`| ${fmtDate(m.date)} | ${fmtContext(m.category, m.tournament)} | ${venue} | ${score} | ${winner} |`);
  }

  lines.push('');
  return lines.join('\n');
}

// ─── Section équipe individuelle ──────────────────────────────────────────────

function buildTeamSection(meta, hist, rank, options) {
  const { limit, showAll } = options;
  const s   = hist.stats;
  const cmp = mergeCompetitive(s);
  const lines = [];

  lines.push(`## ${meta.name}\n`);

  // Infos de base
  lines.push('### Vue d\'ensemble\n');
  const infos = [
    meta.coach    ? `**Sélectionneur :** ${meta.coach}` : null,
    meta.founded  ? `**Fondée :** ${meta.founded}` : null,
    `**Rang WC 2026 (win rate sur 20 ans) :** #${rank + 1} / 48`,
  ].filter(Boolean);
  infos.forEach(l => lines.push(l + '  '));
  lines.push('');

  // Tableau de stats
  lines.push('| Statistique | Tous matchs | Compétitifs | Coupe du Monde | Continental |');
  lines.push('|:---|---:|---:|---:|---:|');

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

  // Forme récente (10 derniers matchs)
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

  // Historique complet
  const finished  = hist.matches.filter(m => m.homeScore !== null && m.awayScore !== null);
  const displayed = showAll ? finished : finished.slice(0, limit);
  const truncNote = (!showAll && displayed.length < finished.length)
    ? ` *(${displayed.length} sur ${finished.length} — ajouter \`--all\` pour tout afficher)*`
    : '';

  lines.push(`### Historique des matchs${truncNote}\n`);
  lines.push('| Date | Adversaire | Lieu | Compétition | Score | Résultat |');
  lines.push('|:---:|:---|:---:|:---|:---:|:---:|');

  const teamName = hist.team.datasetName;
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

  const h2h = computeH2H(histA.matches, histA.team.datasetName, histB.team.datasetName);

  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const opts  = { limit, showAll };

  const md = [
    `# ⚔️ ${metaA.name} vs ${metaB.name}`,
    '',
    `*Rapport généré le ${today} — Historique : ${idx.period}*`,
    '',
    '---',
    '',
    buildH2HSection(
      h2h,
      { ...metaA, datasetName: histA.team.datasetName },
      { ...metaB, datasetName: histB.team.datasetName }
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
