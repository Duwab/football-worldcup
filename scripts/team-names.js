/**
 * Correspondances entre les noms d'équipes football-data.org et le dataset GitHub.
 * Les noms du dataset sont les noms anglophones "standard" utilisés historiquement.
 */

// football-data.org name → dataset name
const FD_TO_DATASET = {
  // Asie
  'Korea Republic':         'South Korea',
  'IR Iran':                'Iran',
  'China PR':               'China',
  'Chinese Taipei':         'Taiwan',
  'Hong Kong, China':       'Hong Kong',
  'Kyrgyz Republic':        'Kyrgyzstan',
  'Macao, China':           'Macau',
  'Palestine, State of':    'Palestine',
  'Syrian Arab Republic':   'Syria',

  // Afrique
  "Côte d'Ivoire":          'Ivory Coast',
  'Cape Verde Islands':     'Cape Verde',
  'Congo DR':               'DR Congo',
  'Congo':                  'Republic of Congo',
  'Guinea-Bissau':          'Guinea-Bissau',
  'São Tomé and Príncipe':  'Sao Tome and Principe',

  // Amériques
  'United States':          'United States',
  'USA':                    'United States',
  'Trinidad & Tobago':      'Trinidad and Tobago',
  'Antigua & Barbuda':      'Antigua and Barbuda',
  'Saint Kitts & Nevis':    'Saint Kitts and Nevis',
  'St. Vincent / Grenadines': 'Saint Vincent and the Grenadines',
  // Curaçao s'écrit identiquement dans les deux sources — pas de mapping nécessaire

  // Europe
  'Türkiye':                'Turkey',
  'North Macedonia':        'North Macedonia',
  'Bosnia & Herzegovina':   'Bosnia and Herzegovina',
  'Bosnia-Herzegovina':     'Bosnia and Herzegovina',
  'Czechia':                'Czech Republic',
  'Slovak Republic':        'Slovakia',
  'Kosovo':                 'Kosovo',
  'Faroe Islands':          'Faroe Islands',

  // Océanie
  'New Zealand':            'New Zealand',
};

// dataset name → football-data.org name (inverse)
const DATASET_TO_FD = Object.fromEntries(
  Object.entries(FD_TO_DATASET).map(([fd, ds]) => [ds, fd])
);

/**
 * Retourne le nom utilisé dans le dataset GitHub à partir d'un nom football-data.org.
 * Si pas de mapping, retourne le nom tel quel.
 */
function toDatasetName(fdName) {
  return FD_TO_DATASET[fdName] || fdName;
}

/**
 * Normalise un nom d'équipe pour la comparaison (minuscules, sans accents, sans ponctuation).
 */
function normalize(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

module.exports = { toDatasetName, normalize, FD_TO_DATASET, DATASET_TO_FD };
