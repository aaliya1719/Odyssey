/**
 * Debug: Add a "debug_interpret" operation to expose raw Gemini text
 * Tests the exact same payload as test-both.mjs but with full body logging
 */
import https from 'https';

const API_KEY = 'sb_publishable_6XO0BUlauW57RyYPCqVygg_pwxCUZ1B';

function post(body, timeoutMs = 40000) {
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
      res.on('end', () => resolve({ status: res.statusCode, raw: d, headers: res.headers }));
    });
    req.on('error',   e  => resolve({ status: 0, raw: `ERROR: ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, raw: 'TIMEOUT after ' + timeoutMs + 'ms' }); });
    req.write(json);
    req.end();
  });
}

const now        = new Date();
const dateIso    = now.toISOString();
const dateLabel  = now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

// Test 1: Exact payload from test-both.mjs
console.log('=== TEST 1: Exact test-both.mjs payload ===');
const r1 = await post({
  operation:          'interpret',
  raw_input:          'maths assign due tomorrow, dorahack submit tonight',
  available_hours:    3,
  energy:             'medium',
  consistency_goals:  [],
  horizon:            'today',
  current_date_iso:   dateIso,
  current_date_label: dateLabel,
});
console.log('HTTP:', r1.status);
console.log('Body:', r1.raw);

// Test 2: Same but slightly longer raw_input
console.log('\n=== TEST 2: Longer raw input ===');
const r2 = await post({
  operation:          'interpret',
  raw_input:          'finish maths assignment due tomorrow morning, submit dorahack hackathon project tonight by 11pm, read 10 pages of the ML book',
  available_hours:    4,
  energy:             'medium',
  consistency_goals:  ['Exercise daily', 'Read 30 min'],
  horizon:            'week',
  current_date_iso:   dateIso,
  current_date_label: dateLabel,
});
console.log('HTTP:', r2.status);
console.log('Body:', r2.raw);

// If test 1 succeeded, test plan too
if (r1.status === 200) {
  console.log('\n=== TEST 3: Plan with items from interpret ===');
  const items = JSON.parse(r1.raw).items;
  const r3 = await post({
    operation:          'plan',
    raw_input:          'maths assign due tomorrow, dorahack submit tonight',
    available_hours:    3,
    energy:             'medium',
    consistency_goals:  [],
    horizon:            'today',
    current_date_label: dateLabel,
    items,
  });
  console.log('HTTP:', r3.status);
  console.log('Body (first 800):', r3.raw.substring(0, 800));
} else {
  console.log('\nSkipping plan test — interpret failed.');
  console.log('Running plan with fallback items...');
  const r3 = await post({
    operation:          'plan',
    raw_input:          'maths assign due tomorrow, dorahack submit tonight',
    available_hours:    3,
    energy:             'medium',
    consistency_goals:  [],
    horizon:            'today',
    current_date_label: dateLabel,
    items: [
      { text: 'Dorahack submission', category: 'deadline', deadlineLabel: 'Tonight', isoDeadline: dateIso.slice(0,10), priority: 'urgent', isConsistency: false },
      { text: 'Maths assignment',    category: 'deadline', deadlineLabel: 'Tomorrow', isoDeadline: null, priority: 'high', isConsistency: false },
    ],
  });
  console.log('HTTP:', r3.status);
  console.log('Body (first 800):', r3.raw.substring(0, 800));
}
