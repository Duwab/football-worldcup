# CLAUDE.md — World Cup Probability Calculator

## Contexte du projet

Application Node.js de collecte et d'analyse de données football pour calculer des probabilités de résultats. Phase actuelle : collecte de données. La prochaine phase est le moteur de probabilités.

**Tournoi cible :** FIFA World Cup 2026 (48 équipes, format en cours)
**Langage :** Node.js (CommonJS, pas d'ESM)

## Architecture

```
scripts/   — scripts de collecte (chacun exécutable seul ou via fetch-all.js)
data/      — données brutes et calculées (gitignorées)
```

Pas encore de `src/` — la logique applicative (modèle de probabilités, API, UI) sera ajoutée dans cette phase.

## Commandes utiles

```bash
npm run fetch:all          # collecte complète (démarre par teams, finit par h2h)
npm run fetch:historical   # télécharge ~47k matchs depuis GitHub (sans quota API)
npm run fetch:stats        # recalcule les stats localement (pas d'appel réseau)
npm run fetch:h2h          # recalcule les H2H localement (pas d'appel réseau)
```

## Sources de données et leurs contraintes

### football-data.org (variable `FOOTBALL_DATA_API_KEY` dans `.env`)
- Tier gratuit : **10 req/min** — le client `scripts/api.js` impose un délai de 6 s entre requêtes
- Couvre : équipes WC 2026, fixtures, classements de groupes en temps réel
- Ne couvre pas : qualifications, amicaux, historique profond

### martj42/international_results (GitHub, sans clé)
- ~47 000 matchs internationaux depuis 1872
- 3 fichiers CSV : `results.csv`, `goalscorers.csv`, `shootouts.csv`
- Script : `fetch-historical.js`, paramètre `HISTORY_YEARS` (défaut 20)
- **Aucun quota**, téléchargement direct depuis `raw.githubusercontent.com`

## Schéma des données clés

### `data/historical/[tla].json`
Fichier principal pour le futur modèle de probabilités. Contient :
- `stats.*` : stats par catégorie (`world_cup`, `world_cup_qualifier`, `continental`, `continental_qualifier`, `nations_league`, `friendly`, `other`)
- `recentForm[]` : 10 derniers matchs avec catégorie et venue (home/away/neutral)
- `topScorers[]` : buteurs sur 20 ans
- `matches[]` : tous les matchs enrichis (buts + tirs au but)

### `data/historical/index.json`
Résumé comparatif des 48 équipes. Contient `competitiveStats` (fusion WC + qualifs + continental + qualifs continentales + nations league) pour comparer les équipes hors amicaux.

### Catégories de tournois
Définies dans `scripts/fetch-historical.js` → constante `TOURNAMENT_RULES` (tableau de `{match: RegExp, cat: string}`).

## Correspondances de noms d'équipes

Le fichier `scripts/team-names.js` gère les différences de nommage entre football-data.org et le dataset GitHub :
- `FD_TO_DATASET` : football-data → dataset (ex. `"Korea Republic"` → `"South Korea"`)
- Fonctions : `toDatasetName(fdName)`, `normalize(name)`
- Si une équipe retourne 0 matchs, vérifier ce fichier en premier.

## Conventions de code

- **CommonJS** (`require`/`module.exports`), pas d'`import`/`export`
- Chaque script est autonome : peut être lancé directement (`node scripts/fetch-xxx.js`) ou importé via `require`
- Les scripts réseau respectent le rate-limiting via `scripts/api.js`
- Les scripts de calcul local (`fetch-stats.js`, `fetch-h2h.js`, `fetch-historical.js`) lisent depuis `data/` et n'utilisent pas l'API football-data
- Pas de TypeScript pour l'instant — ajouter seulement si la complexité le justifie

## État des données au démarrage

Pour que les scripts de calcul local fonctionnent, l'ordre de collecte est :
1. `fetch:teams` (prérequis de tout le reste)
2. `fetch:matches` + `fetch:standings` (dépendent de teams)
3. `fetch:historical` (indépendant, mais utilise teams pour le mapping)
4. `fetch:stats` (dépend de matches)
5. `fetch:h2h` (dépend de standings + matches)

## Prochaines phases prévues

1. **Modèle de probabilités** — pondération par type de compétition et récence, facteur terrain neutre, simulation Monte Carlo
2. **API REST** — exposition des probabilités (framework à choisir : Fastify ou Express)
3. **Interface web** — visualisation des résultats et des scénarios
