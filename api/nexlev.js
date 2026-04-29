const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const today = new Date();
  const cutoff = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const prompt = `
Use the NexLev search_niche_finder_channels tool 6 times to find 70+ YouTube channels created after ${cutoffStr}.

Search 1 - highgrowth A: query="fast growing viral channel trending documentary history", channelCreatedAfter="${cutoffStr}", minMonthlyViews=1000000, minAvgViewsPerVideo=5000, limit=100
Search 2 - highgrowth B: query="science education technology finance business news", channelCreatedAfter="${cutoffStr}", minMonthlyViews=1000000, minAvgViewsPerVideo=5000, limit=100
Search 3 - sleep A: query="sleep music relaxing sounds meditation ambient nature", channelCreatedAfter="${cutoffStr}", minMonthlyViews=200000, minAvgVideoLength=2400, limit=100
Search 4 - sleep B: query="long form bedtime stories narration history documentary calm", channelCreatedAfter="${cutoffStr}", minMonthlyViews=200000, minAvgVideoLength=2400, limit=100
Search 5 - automation A: query="faceless automation viral content no face creator", channelCreatedAfter="${cutoffStr}", minMonthlyViews=1000000, isFaceless=true, limit=100
Search 6 - automation B: query="animation compilation reaction commentary internet culture", channelCreatedAfter="${cutoffStr}", minMonthlyViews=1000000, isFaceless=true, limit=100

After all 6 searches, return ONLY valid JSON (no explanation) in this exact format:
{
  "generated": "${todayStr}",
  "highgrowth": [...],
  "sleep": [...],
  "automation": [...]
}

Each channel object: { "id": ytChannelId, "title", "username", "thumb": thumbnailUrl, "location": location||"—", "created": channelCreationDate, "firstVid": stats.firstVideoDate, "lastVid": stats.lastVideoDate, "faceless": isFaceless, "ai": isAiChannel, "quality", "outlier": outlierScore, "tags": [], "cat": category.name, "fmt": format.name, "subs": stats.subscribers, "monthlyRev": stats.monthlyRevenue, "monthlyViews": stats.monthlyViews, "avgViews": stats.avgViewsPerVideo, "avgLen": stats.avgVideoLength, "uploadsWk": stats.uploadsPerWeek, "rpm": stats.rpm.total||stats.rpm||0, "videos": stats.totalVideos }

Filter rules:
- highgrowth: merge+dedup searches 1+2, keep rpm>=4 AND monthlyViews>=1000000 AND avgViews>=5000
- sleep: merge+dedup searches 3+4, keep rpm>=4 AND monthlyViews>=200000 AND avgLen>=2400
- automation: merge+dedup searches 5+6, keep monthlyViews>=1000000 AND faceless=true, exclude ids already in highgrowth

Return ONLY the JSON object, nothing else.
`;

  try {
    const response = await client.beta.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      mcp_servers: [
        {
          type: 'url',
          url: 'https://prod.dashboard.nexlev.io/api/claude-mcp',
          name: 'NexLev',
          ...(process.env.NEXLEV_TOKEN ? { authorization_token: process.env.NEXLEV_TOKEN } : {}),
        }
      ],
      messages: [{ role: 'user', content: prompt }],
      betas: ['mcp-client-2025-04-04'],
    });

    const text = response.content.find(b => b.type === 'text')?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'No JSON in response', raw: text.slice(0, 500) });

    const data = JSON.parse(jsonMatch[0]);
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
