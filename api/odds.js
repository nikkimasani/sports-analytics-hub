const https = require('https');

/**
 * The Odds API Proxy
 * Free tier: 500 requests/month
 * Query params:
 *   sport  – upcoming sport key (e.g. basketball_nba, americanfootball_nfl, baseball_mlb)
 *   region – us | uk | eu | au (default: us)
 *   market – h2h | spreads | totals (default: h2h)
 */

const SPORT_MAP = {
  nba: 'basketball_nba',
  nfl: 'americanfootball_nfl',
  mlb: 'baseball_mlb',
  ncaa: 'americanfootball_ncaaf',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      let data = '';
      resp.on('data', (chunk) => (data += chunk));
      resp.on('end', () => {
        if (resp.statusCode >= 400) {
          const err = new Error(`Odds API returned ${resp.statusCode}`);
          err.statusCode = resp.statusCode;
          err.body = data;
          return reject(err);
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse Odds API response')); }
      });
    }).on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const { sport, region, market } = req.query || {};
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    // Return empty array if no key configured — frontend will use fallback
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ events: [], note: 'ODDS_API_KEY not configured' }));
  }

  const sportKey = SPORT_MAP[sport] || sport || 'basketball_nba';
  const reg = region || 'us';
  const mkt = market || 'h2h,spreads,totals';

  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=${reg}&markets=${mkt}&oddsFormat=american`;

  try {
    const data = await fetchJson(url);
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    });
    return res.end(JSON.stringify({ events: data }));
  } catch (err) {
    res.writeHead(err.statusCode || 502, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Odds API request failed', detail: err.message }));
  }
};
