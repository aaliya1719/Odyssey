/**
 * Direct diagnostic: tests Gemini model via the Edge Function
 * and also directly if we have a key.
 * 
 * Run: node test-gemini-direct.mjs [GEMINI_API_KEY]
 */
import https from 'https';

const API_KEY = 'sb_publishable_6XO0BUlauW57RyYPCqVygg_pwxCUZ1B';
const GEMINI_KEY = process.argv[2] || null;

function post(body, timeoutMs = 35000) {
  return new Promise((resolve) => {
    const json = JSON.stringify(body);
    const opts = {
      hostname: 'iiywpvjtvzkkwxfgrqnd.supabase.co',
      path: '/functions/v1/suggest-mission',
      method: 'POST',
      headers: {
        'apikey':         API_KEY,
        'Authorization':  `Bearer ${API_KEY}`,
        'Content-Type':   'application/json',
        'x-client-info':  'supabase-js-web/2.112.4',
        'Content-Length': Buffer.byteLength(json),
      },
      timeout: timeoutMs,
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, raw: d }));
    });
    req.on('error',   e  => resolve({ status: 0, raw: `ERROR: ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, raw: 'TIMEOUT after ' + timeoutMs + 'ms' }); });
    req.write(json);
    req.end();
  });
}

function geminiDirect(apiKey, model, prompt) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
        maxOutputTokens: 200,
      },
    });
    const opts = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, raw: d }));
    });
    req.on('error',   e  => resolve({ status: 0, raw: `ERROR: ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, raw: 'TIMEOUT' }); });
    req.write(body);
    req.end();
  });
}

const now        = new Date();
const dateIso    = now.toISOString();
const dateLabel  = now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

// ── 1. Test through Edge Function (interpret) — verbose response ──────────────
console.log('=== EDGE FUNCTION: interpret (watching full response) ===');
const r1 = await post({
  operation:          'interpret',
  raw_input:          'finish the dorahack submission tonight',
  available_hours:    2,
  energy:             'high',
  consistency_goals:  [],
  horizon:            'today',
  current_date_iso:   dateIso,
  current_date_label: dateLabel,
}, 40000);
console.log('HTTP:', r1.status);
console.log('Body (full):', r1.raw);

// ── 2. If we have a GEMINI_KEY, test models directly ─────────────────────────
if (GEMINI_KEY) {
  const models = ['gemini-3.6-flash', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite'];
  const simplePrompt = 'Return valid JSON: {"ok": true}';
  
  console.log('\n=== DIRECT GEMINI MODEL TESTS ===');
  for (const model of models) {
    const r = await geminiDirect(GEMINI_KEY, model, simplePrompt);
    const preview = r.raw.substring(0, 300);
    console.log(`\nModel: ${model}`);
    console.log(`HTTP: ${r.status}`);
    console.log(`Body: ${preview}`);
  }
} else {
  console.log('\nNo GEMINI_KEY provided — skipping direct model tests.');
  console.log('To test models directly: node test-gemini-direct.mjs YOUR_GEMINI_KEY');
}
