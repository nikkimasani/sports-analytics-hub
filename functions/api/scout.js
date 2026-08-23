const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ report: null, note: 'ANTHROPIC_API_KEY not configured, using local fallback' }, { headers: CORS_HEADERS });
  }

  try {
    const { player, sport } = await request.json();
    if (!player || !player.name) {
      return Response.json({ error: 'Missing player data in request body' }, { status: 400, headers: CORS_HEADERS });
    }

    const prompt = `You are an expert sports scout. Generate a detailed scouting report for ${player.name} (${sport?.toUpperCase() || 'unknown sport'}, ${player.team}, ${player.pos || player.position}).\n\nPlayer stats: ${JSON.stringify(player)}\n\nWrite a professional scouting report with these sections:\n1. **Overview** (2-3 sentences on the player's role and impact)\n2. **Strengths** (3-4 bullet points)\n3. **Weaknesses** (2-3 bullet points)\n4. **Fantasy Outlook** (2-3 sentences on fantasy value, buy/sell/hold recommendation)\n5. **Comparable Players** (name 2 similar players and why)\n\nKeep it concise, under 300 words total. Use markdown formatting.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      return Response.json({ error: 'Scout API failed', detail: `Anthropic API returned ${response.status}: ${text.slice(0, 300)}` }, { status: 502, headers: CORS_HEADERS });
    }
    const data = JSON.parse(text);
    return new Response(JSON.stringify({ report: data.content?.[0]?.text || '' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (error) {
    return Response.json({ error: 'Scout API failed', detail: error.message }, { status: 502, headers: CORS_HEADERS });
  }
}
