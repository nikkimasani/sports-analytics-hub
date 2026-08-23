const VALID_SPORTS = ['basketball', 'football', 'baseball'];
const VALID_LEAGUES = ['nba', 'nfl', 'mlb', 'college-football', 'mens-college-basketball'];
const VALID_ENDPOINTS = ['athletes', 'scoreboard', 'teams', 'standings', 'allteams', 'athlete-stats', 'athlete-gamelog', 'news', 'summary'];
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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
  return `${base}/${sport}/${league}/${endpoint}${params.size ? `?${params}` : ''}`;
}

function cacheSeconds(endpoint) {
  if (endpoint === 'scoreboard') return 60;
  if (endpoint === 'news') return 300;
  if (endpoint === 'standings') return 900;
  return 3600;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const sport = url.searchParams.get('sport');
  const league = url.searchParams.get('league');
  const endpoint = url.searchParams.get('endpoint');
  const team = url.searchParams.get('team');
  const page = url.searchParams.get('page');
  const limit = url.searchParams.get('limit');
  const athleteId = url.searchParams.get('athleteId');
  const eventId = url.searchParams.get('eventId');

  if (!sport || !league || !endpoint) {
    return Response.json({ error: 'Missing required query params: sport, league, endpoint' }, { status: 400, headers: CORS_HEADERS });
  }
  if (!VALID_SPORTS.includes(sport) || !VALID_LEAGUES.includes(league) || !VALID_ENDPOINTS.includes(endpoint)) {
    return Response.json({ error: 'Invalid sport, league, or endpoint' }, { status: 400, headers: CORS_HEADERS });
  }
  if (endpoint === 'athletes' && !team) return Response.json({ error: 'athletes endpoint requires a team query param' }, { status: 400, headers: CORS_HEADERS });
  if (endpoint === 'summary' && !eventId) return Response.json({ error: 'summary endpoint requires an eventId query param' }, { status: 400, headers: CORS_HEADERS });
  if ((endpoint === 'athlete-stats' || endpoint === 'athlete-gamelog') && !athleteId) {
    return Response.json({ error: `${endpoint} endpoint requires an athleteId query param` }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const upstream = await fetch(buildEspnUrl(sport, league, endpoint, { team, page, limit, athleteId, eventId }), {
      headers: { Accept: 'application/json', 'User-Agent': 'StatVault/1.0' },
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return Response.json({ error: 'ESPN API request failed', detail: `ESPN API returned ${upstream.status}`, upstream: text.slice(0, 500) }, { status: upstream.status, headers: CORS_HEADERS });
    }
    let data = JSON.parse(text);
    if (endpoint === 'allteams' && data.sports) {
      const teams = [];
      for (const sportData of data.sports) for (const leagueData of sportData.leagues || []) for (const teamData of leagueData.teams || []) {
        const info = teamData.team || teamData;
        teams.push({ id: info.id, name: info.displayName || info.name, abbreviation: info.abbreviation, shortName: info.shortDisplayName || info.shortName, logo: info.logos?.[0]?.href || null });
      }
      data = { league, count: teams.length, teams };
    }
    return new Response(JSON.stringify(data), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${cacheSeconds(endpoint)}` },
    });
  } catch (error) {
    return Response.json({ error: 'ESPN API request failed', detail: error.message }, { status: 502, headers: CORS_HEADERS });
  }
}
