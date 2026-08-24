import { collectLatest } from './latest.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/latest') {
      try {
        const baselineResponse = await env.ASSETS.fetch(new URL('/data/baseline.json', request.url));
        if (!baselineResponse.ok) throw new Error('无法读取静态基线');
        const baseline = await baselineResponse.json();
        return json(await collectLatest({ baselines: baseline.sources }));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
