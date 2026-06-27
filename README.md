# World Cup Probability Calculator

Collecte et analyse de données pour calculer des probabilités de résultats lors de la Coupe du Monde de Football 2026 (et des tournois suivants).

## Fonctionnalités actuelles

- Récupération des 48 équipes qualifiées via l'API football-data.org
- Historique complet des matchs internationaux sur 20 ans (résultats, buteurs, tirs au but)
- Statistiques par équipe ventilées par type de compétition
- Classements de la phase de groupes en temps réel
- Historiques face-à-face (H2H) entre équipes d'un même groupe
- Rapport markdown comparatif entre deux équipes (stats, H2H, historique des matchs)

## Prérequis

- Node.js ≥ 18
- Clé API gratuite sur [football-data.org](https://www.football-data.org/client/register)

## Installation

```bash
npm install
cp .env.example .env
# Renseigner FOOTBALL_DATA_API_KEY dans .env
```

## Collecte des données

```bash
# Tout récupérer en une seule commande
npm run fetch:all

# Ou script par script
npm run fetch:teams       # 48 équipes qualifiées
npm run fetch:matches     # matchs du tournoi + historique récent (API)
npm run fetch:standings   # classements phase de groupes (API)
npm run fetch:rankings    # métadonnées ranking FIFA (API)
npm run fetch:historical  # historique 20 ans toutes compétitions (GitHub, sans quota)
npm run fetch:stats       # statistiques agrégées (calcul local)
npm run fetch:h2h         # historiques face-à-face par groupe (calcul local)
```

## Génération de rapports

```bash
# Rapport comparatif entre deux équipes (par code TLA)
npm run compare -- FRA ARG

# Limiter l'historique à N matchs (défaut : 50)
npm run compare -- FRA ARG --limit 20

# Afficher tout l'historique (20 ans)
npm run compare -- FRA ARG --all

# Chemin de sortie personnalisé
npm run compare -- FRA ARG --output mon-rapport.md
```

Le rapport est sauvegardé dans `data/reports/<tla1>-vs-<tla2>.md`. Il contient :
- **Confrontations directes** : bilan global, 5 derniers H2H, historique complet des rencontres avec buteurs
- **Stats individuelles** : tous matchs, compétitifs, Coupe du Monde, continental (tableau comparatif)
- **Forme récente** : 10 derniers matchs avec contexte, lieu, score et buteurs
- **Historique des matchs** : date, adversaire, lieu, compétition, score (avec t.a.b. / a.p.), résultat et buteurs

> `fetch:historical` n'utilise pas la clé API football-data.org — il télécharge directement depuis [martj42/international_results](https://github.com/martj42/international_results).

## Structure des données

```
data/
├── teams/
│   └── teams.json                  # 48 équipes (id, nom, TLA, confederation...)
│
├── matches/
│   ├── wc2026-all.json             # tous les matchs du tournoi WC 2026
│   └── [tla].json                  # 10 derniers matchs joués par équipe (API)
│
├── standings/
│   └── groups.json                 # classements phase de groupes en temps réel
│
├── rankings/
│   └── fifa-rankings.json          # métadonnées compétition + liste des équipes
│
├── historical/
│   ├── index.json                  # résumé comparatif des 48 équipes
│   └── [tla].json                  # historique complet par équipe (voir ci-dessous)
│
├── stats/
│   ├── summary.json                # classement comparatif (win rate, buts...)
│   └── [tla].json                  # stats détaillées + forme récente par équipe
│
└── h2h/
    └── [tla1]-vs-[tla2].json       # historique face-à-face (1128 fichiers)
```

### Format d'un fichier `data/historical/[tla].json`

```jsonc
{
  "team": { "id": 773, "name": "France", "tla": "FRA", "datasetName": "France" },
  "period": { "from": "2006-01-01", "to": "2026-06-27" },
  "stats": {
    "total":                   { "played": 262, "won": 161, "winRate": 61.5, ... },
    "world_cup":               { "played": 27,  "won": 18,  "winRate": 66.7, ... },
    "world_cup_qualifier":     { ... },
    "continental":             { ... },
    "continental_qualifier":   { ... },
    "nations_league":          { ... },
    "friendly":                { ... },
    "other":                   { ... }
  },
  "recentForm": [
    { "date": "2026-06-22", "opponent": "Iraq", "score": "3-0", "result": "W",
      "tournament": "FIFA World Cup", "category": "world_cup", "venue": "home" }
  ],
  "topScorers": [
    { "name": "Kylian Mbappé", "goals": 49, "penalties": 0 }
  ],
  "matches": [
    {
      "date": "...", "home": "...", "away": "...",
      "homeScore": 3, "awayScore": 0,
      "tournament": "FIFA World Cup", "category": "world_cup",
      "neutral": false,
      "shootout": null,
      "goals": [{ "team": "France", "scorer": "Mbappé", "ownGoal": false, "penalty": false }]
    }
  ]
}
```

### Catégories de tournois

| Catégorie | Exemples |
|---|---|
| `world_cup` | FIFA World Cup |
| `world_cup_qualifier` | FIFA WC Qualification (toutes confédérations) |
| `continental` | UEFA Euro, Copa América, AFCON, AFC Asian Cup, CONCACAF Gold Cup... |
| `continental_qualifier` | Qualifications pour les tournois continentaux |
| `nations_league` | UEFA Nations League, CONCACAF Nations League... |
| `friendly` | Matchs amicaux |
| `other` | Tournois régionaux, Coupe des Confédérations... |

## Sources de données

| Source | Usage | Quota |
|---|---|---|
| [football-data.org](https://www.football-data.org) v4 | Équipes, fixtures WC 2026, classements temps réel | 10 req/min (tier gratuit) |
| [martj42/international_results](https://github.com/martj42/international_results) | Historique 1872–aujourd'hui : scores, buteurs, tirs au but | Aucun (fichiers GitHub) |

## Variables d'environnement

| Variable | Requis | Défaut | Description |
|---|---|---|---|
| `FOOTBALL_DATA_API_KEY` | Oui | — | Token football-data.org |
| `SEASON` | Non | `2026` | Saison à analyser |
| `HISTORY_YEARS` | Non | `20` | Profondeur historique en années |

## Prochaines étapes

- [ ] Modèle de probabilités (pondération compétition, récence, domicile/neutre)
- [ ] Simulation Monte Carlo de la phase de groupes et des K.O.
- [ ] API REST pour exposer les probabilités
- [ ] Interface web de visualisation
