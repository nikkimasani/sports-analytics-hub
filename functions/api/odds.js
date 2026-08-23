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

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const sport = url.searchParams.get('sport');
  const region = url.searchParams.get('region') || 'us';
  const market = url.searchParams.get('market') || 'h2h,spreads,totals';
  const apiKey = env.ODDS_API_KEY;

  if (!apiKey) {
    return Response.json({ events: [], note: 'ODDS_API_KEY not configured' }, { headers: CORS_HEADERS });
  }

  const sportKey = SPORT_MAP[sport] || sport || 'basketball_nba';
  const upstream = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds/`);
  upstream.searchParams.set('apiKey', apiKey);
  upstream.searchParams.set('regions', region);
  upstream.searchParams.set('markets', market);
  upstream.searchParams.set('oddsFormat', 'american');

  try {
    const response = await fetch(upstream, { headers: { Accept: 'application/json' } });
    const text = await response.text();
    if (!response.ok) {
      return Response.json({ error: 'Odds API request failed', detail: `Odds API returned ${response.status}` }, { status: response.status, headers: CORS_HEADERS });
    }
    return new Response(JSON.stringify({ events: JSON.parse(text) }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (error) {
    return Response.json({ error: 'Odds API request failed', detail: error.message }, { status: 502, headers: CORS_HEADERS });
  }
}
