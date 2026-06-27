require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

if (!API_KEY) {
  console.error('❌  FOOTBALL_DATA_API_KEY manquant dans .env');
  console.error('   Inscrivez-vous gratuitement sur https://www.football-data.org/client/register');
  process.exit(1);
}

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'X-Auth-Token': API_KEY },
  timeout: 10000,
});

// Respecte la limite de 10 req/min du tier gratuit
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 6100;

async function get(path, params = {}) {
  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastRequestTime);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  try {
    const res = await client.get(path, { params });
    lastRequestTime = Date.now();
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.message;
    throw new Error(`[${status}] GET ${path} → ${msg}`);
  }
}

module.exports = { get };
