const https = require('https');

/**
 * AI Scout Report Generator
 * Uses Anthropic Claude API to generate scouting reports from player data.
 * Requires ANTHROPIC_API_KEY env var in Vercel.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function callClaude(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`Anthropic API returned ${res.statusCode}: ${data.substring(0, 300)}`));
        }
        try {
          const parsed = JSON.parse(data);
          const text = parsed.content?.[0]?.text || '';
          resolve(text);
        } catch (e) {
          reject(new Error('Failed to parse Anthropic response'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ report: null, note: 'ANTHROPIC_API_KEY not configured — using local fallback' }));
  }

  try {
    const { player, sport } = req.body || {};
    if (!player || !player.name) {
      res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing player data in request body' }));
    }

    const prompt = `You are an expert sports scout. Generate a detailed scouting report for ${player.name} (${sport?.toUpperCase() || 'unknown sport'}, ${player.team}, ${player.pos || player.position}).

Player stats: ${JSON.stringify(player, null, 0)}

Write a professional scouting report with these sections:
1. **Overview** (2-3 sentences on the player's role and impact)
2. **Strengths** (3-4 bullet points)
3. **Weaknesses** (2-3 bullet points)
4. **Fantasy Outlook** (2-3 sentences on fantasy value, buy/sell/hold recommendation)
5. **Comparable Players** (name 2 similar players and why)

Keep it concise — under 300 words total. Use markdown formatting.`;

    const report = await callClaude(prompt, apiKey);

    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=3600',
    });
    return res.end(JSON.stringify({ report }));
  } catch (err) {
    res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Scout API failed', detail: err.message }));
  }
};
