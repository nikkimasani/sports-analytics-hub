const https = require('https');

/**
 * ESPN Public API Proxy
 *
 * Query params:
 *   sport    – basketball | football | baseball (required)
 *   league   – nba | nfl | mlb | college-football | mens-college-basketball (required)
 *   endpoint – athletes | scoreboard | teams | standings | allteams (required)
 *   team     – team ID (required for roster lookup via athletes endpoint)
 *   page     – pagination page number (optional)
 *   limit    – results per page (optional)
 */

const VALID_SPORTS = ['basketball', 'football', 'baseball'];
const VALID_LEAGUES = ['nba', 'nfl', 'mlb', 'college-football', 'mens-college-basketball'];
const VALID_ENDPOINTS = ['athletes', 'scoreboard', 'teams', 'standings', 'allteams', 'athlete-stats', 'athlete-gamelog', 'news'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (resp) => {
        let data = '';
        resp.on('data', (chunk) => (data += chunk));
        resp.on('end', () => {
          if (resp.statusCode >= 400) {
            const err = new Error(`ESPN API returned ${resp.statusCode}`);
            err.statusCode = resp.statusCode;
            err.body = data;
            return reject(err);
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Failed to parse ESPN response as JSON'));
          }
        });
      })
      .on('error', reject);
  });
}

function buildEspnUrl(sport, league, endpoint, query) {
  const base = 'https://site.api.espn.com/apis/site/v2/sports';

  // Roster lookup: /sports/{sport}/{league}/teams/{teamId}/roster
  if (endpoint === 'athletes' && query.team) {
    return `${base}/${sport}/${league}/teams/${query.team}/roster`;
  }

  // Individual athlete stats: /sports/{sport}/{league}/athletes/{athleteId}
  if (endpoint === 'athlete-stats' && query.athleteId) {
    return `${base}/${sport}/${league}/athletes/${query.athleteId}`;
  }

  // Athlete game log / career stats: uses the statistics sub-resource
  if (endpoint === 'athlete-gamelog' && query.athleteId) {
    return `${base}/${sport}/${league}/athletes/${query.athleteId}/statistics`;
  }

  // News: /sports/{sport}/{league}/news
  if (endpoint === 'news') {
    return `${base}/${sport}/${league}/news?limit=20`;
  }

  // All-teams helper: fetch the teams list, return just IDs + names
  if (endpoint === 'allteams') {
    const params = new URLSearchParams({ limit: '200' });
    return `${base}/${sport}/${league}/teams?${params}`;
  }

  // Standings uses a different API base path; level=3 returns divisions
  if (endpoint === 'standings') {
    return `https://site.api.espn.com/apis/v2/sports/${sport}/${league}/standings?level=3`;
  }

  // Standard endpoints: scoreboard, teams, athletes (no team)
  const params = new URLSearchParams();
  if (query.page) params.set('page', query.page);
  if (query.limit) params.set('limit', query.limit);

  const qs = params.toString();
  return `${base}/${sport}/${league}/${endpoint}${qs ? '?' + qs : ''}`;
}

function getCacheSeconds(endpoint) {
  if (endpoint === 'scoreboard') return 300; // 5 min
  return 3600; // 1 hour for rosters, teams, standings, allteams
}

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  // Only allow GET
  if (req.method !== 'GET') {
    res.writeHead(405, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const { sport, league, endpoint, team, page, limit, athleteId } = req.query || {};

  // --- Validation ---
  if (!sport || !league || !endpoint) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        error: 'Missing required query params: sport, league, endpoint',
        valid: { sports: VALID_SPORTS, leagues: VALID_LEAGUES, endpoints: VALID_ENDPOINTS },
      })
    );
  }

  if (!VALID_SPORTS.includes(sport)) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: `Invalid sport "${sport}"`, valid: VALID_SPORTS }));
  }

  if (!VALID_LEAGUES.includes(league)) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: `Invalid league "${league}"`, valid: VALID_LEAGUES }));
  }

  if (!VALID_ENDPOINTS.includes(endpoint)) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: `Invalid endpoint "${endpoint}"`, valid: VALID_ENDPOINTS }));
  }

  if (endpoint === 'athletes' && !team) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({ error: 'athletes endpoint requires a "team" query param (team ID)' })
    );
  }

  if ((endpoint === 'athlete-stats' || endpoint === 'athlete-gamelog') && !req.query.athleteId) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({ error: `${endpoint} endpoint requires an "athleteId" query param` })
    );
  }

  // --- Build URL & fetch ---
  const url = buildEspnUrl(sport, league, endpoint, { team, page, limit, athleteId });
  const cacheSec = getCacheSeconds(endpoint);

  try {
    let data = await fetchJson(url);

    // For allteams, slim the response down to id + name + abbreviation
    if (endpoint === 'allteams' && data.sports) {
      const teams = [];
      for (const s of data.sports) {
        for (const lg of s.leagues || []) {
          for (const t of lg.teams || []) {
            const info = t.team || t;
            teams.push({
              id: info.id,
              name: info.displayName || info.name,
              abbreviation: info.abbreviation,
              shortName: info.shortDisplayName || info.shortName,
              logo: info.logos && info.logos[0] ? info.logos[0].href : null,
            });
          }
        }
      }
      data = { league, count: teams.length, teams };
    }

    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': `public, s-maxage=${cacheSec}, stale-while-revalidate=${cacheSec * 2}`,
    });
    return res.end(JSON.stringify(data));
  } catch (err) {
    const status = err.statusCode || 502;
    res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        error: 'ESPN API request failed',
        detail: err.message,
        upstream: err.body ? err.body.substring(0, 500) : undefined,
      })
    );
  }
};
