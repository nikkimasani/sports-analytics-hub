const VALID_SPORTS = ['basketball', 'football', 'baseball'];
const VALID_LEAGUES = ['nba', 'nfl', 'mlb', 'college-football', 'mens-college-basketball'];
const VALID_ENDPOINTS = ['athletes', 'scoreboard', 'teams', 'standings', 'allteams', 'athlete-stats', 'athlete-gamelog', 'news', 'summary'];
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'StatVault/1.0' }, signal: controller.signal });
    const body = await response.text();
    if (!response.ok) {
      const error = new Error(`ESPN API returned ${response.status}`);
      error.statusCode = response.status;
      error.body = body;
      throw error;
    }
    return JSON.parse(body);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('ESPN API request timed out');
    if (error instanceof SyntaxError) throw new Error('Failed to parse ESPN response as JSON');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildEspnUrl(sport, league, endpoint, query) {
  const base = 'https://site.web.api.espn.com/apis/site/v2/sports';
  if (endpoint === 'athletes' && query.team) return `${base}/${sport}/${league}/teams/${query.team}/roster`;
  if (endpoint === 'athlete-stats' && query.athleteId) return `${base}/${sport}/${league}/athletes/${query.athleteId}`;
  if (endpoint === 'athlete-gamelog' && query.athleteId) return `${base}/${sport}/${league}/athletes/${query.athleteId}/statistics`;
  if (endpoint === 'summary' && query.eventId) return `${base}/${sport}/${league}/summary?event=${query.eventId}`;
  if (endpoint === 'news') return `${base}/${sport}/${league}/news?limit=20`;
  if (endpoint === 'allteams') return `${base}/${sport}/${league}/teams?limit=200`;
  if (endpoint === 'standings') return `https://site.web.api.espn.com/apis/v2/sports/${sport}/${league}/standings?level=3`;
  const params = new URLSearchParams();
  if (query.page) params.set('page', query.page);
  if (query.limit) params.set('limit', query.limit);
  const queryString = params.toString();
  return `${base}/${sport}/${league}/${endpoint}${queryString ? '?' + queryString : ''}`;
}

function getCacheSeconds(endpoint) {
  if (endpoint === 'scoreboard') return 60;
  if (endpoint === 'news') return 300;
  if (endpoint === 'standings') return 900;
  return 3600;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }
  if (req.method !== 'GET') {
    res.writeHead(405, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const { sport, league, endpoint, team, page, limit, athleteId, eventId } = req.query || {};
  if (!sport || !league || !endpoint) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Missing required query params: sport, league, endpoint', valid: { sports: VALID_SPORTS, leagues: VALID_LEAGUES, endpoints: VALID_ENDPOINTS } }));
  }
  if (!VALID_SPORTS.includes(sport) || !VALID_LEAGUES.includes(league) || !VALID_ENDPOINTS.includes(endpoint)) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid sport, league, or endpoint' }));
  }
  if (endpoint === 'athletes' && !team) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'athletes endpoint requires a team query param' }));
  }
  if (endpoint === 'summary' && !eventId) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'summary endpoint requires an eventId query param' }));
  }
  if ((endpoint === 'athlete-stats' || endpoint === 'athlete-gamelog') && !athleteId) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: `${endpoint} endpoint requires an athleteId query param` }));
  }

  try {
    let data = await fetchJson(buildEspnUrl(sport, league, endpoint, { team, page, limit, athleteId, eventId }));
    if (endpoint === 'allteams' && data.sports) {
      const teams = [];
      for (const sportData of data.sports) for (const leagueData of sportData.leagues || []) for (const teamData of leagueData.teams || []) {
        const info = teamData.team || teamData;
        teams.push({ id: info.id, name: info.displayName || info.name, abbreviation: info.abbreviation, shortName: info.shortDisplayName || info.shortName, logo: info.logos?.[0]?.href || null });
      }
      data = { league, count: teams.length, teams };
    }
    const cacheSeconds = getCacheSeconds(endpoint);
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': `public, s-maxage=${cacheSeconds}, stale-while-revalidate=60` });
    return res.end(JSON.stringify(data));
  } catch (error) {
    const status = error.statusCode || 502;
    res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'ESPN API request failed', detail: error.message, upstream: error.body ? error.body.substring(0, 500) : undefined }));
  }
};
