/* Serverless proxy for Groq (Vercel). The API key never reaches the browser.
 *
 * Environment variables (Vercel > Settings > Environment Variables):
 *   GROQ_API_KEY   required
 *   GROQ_MODEL     optional, default openai/gpt-oss-20b
 *   ALLOWED_ORIGIN optional, extra allowed origins, comma separated
 */
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const IS_OSS = /gpt-oss/i.test(MODEL);

const MAX_MESSAGES = 24;
const MAX_CHARS = 16000;
const MAX_TOKENS = 2500;
const WINDOW_MS = 60 * 1000;
const LIMIT = 20; // requests per IP per minute (best effort: per server instance)
const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > LIMIT;
}
const fail = (res, status, message) => res.status(status).json({ error: { message, proxy: true } });

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.GROQ_API_KEY;

  if (req.method === 'GET') return res.status(200).json({ ok: !!key, model: MODEL });
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return fail(res, 405, 'Method not allowed.'); }
  if (!key) return fail(res, 503, 'GROQ_API_KEY is not set on the server. Add it in Vercel (Settings, Environment Variables) and redeploy.');

  // Only accept browser calls from this site (or ALLOWED_ORIGIN).
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const extra = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    let ok = extra.includes(origin);
    try { ok = ok || new URL(origin).host === host; } catch {}
    if (!ok) return fail(res, 403, 'Origin not allowed.');
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
  if (limited(ip)) return fail(res, 429, 'Too many requests. Wait a minute and try again.');

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const msgs = body && body.messages;
  if (!Array.isArray(msgs) || !msgs.length || msgs.length > MAX_MESSAGES) return fail(res, 400, 'Invalid messages.');

  let total = 0;
  const clean = [];
  for (const m of msgs) {
    if (!m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return fail(res, 400, 'Invalid message format.');
    total += m.content.length;
    clean.push({ role: m.role, content: m.content });
  }
  if (total > MAX_CHARS) return fail(res, 413, 'Conversation is too long. Start a new chat.');

  const stream = !!body.stream;
  const temperature = Math.min(Math.max(Number(body.temperature) || 0.7, 0), 1.2);
  const max_tokens = Math.min(Math.max(parseInt(body.max_tokens, 10) || 2048, 64), MAX_TOKENS);

  const build = withReason => {
    const b = { model: MODEL, messages: clean, temperature, max_tokens, stream };
    if (IS_OSS && withReason) { b.reasoning_effort = 'low'; b.include_reasoning = false; }
    return JSON.stringify(b);
  };
  const call = withReason => fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: build(withReason)
  });

  let up;
  try {
    up = await call(true);
    if (up.status === 400 && IS_OSS && /reason/i.test(await up.clone().text())) up = await call(false);
  } catch {
    return fail(res, 502, 'Could not reach Groq from the server.');
  }

  if (!up.ok) {
    let msg = '';
    try { msg = (await up.json()).error?.message || ''; } catch {}
    if (up.status === 401) return fail(res, 502, 'The server’s Groq API key was rejected. Check GROQ_API_KEY in Vercel.');
    return fail(res, up.status, msg || 'Groq error ' + up.status);
  }

  if (!stream) return res.status(200).json(await up.json());

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no'
  });
  try { for await (const chunk of up.body) res.write(chunk); } catch {}
  res.end();
};
