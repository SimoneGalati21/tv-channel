// node proxy/worker.test.mjs  (chiama il relinker Rai vero: serve rete e IP italiano)
import assert from 'assert';
import worker from './worker.js';

var bad = await worker.fetch(new Request('https://p.example/?url=https://evil.example'));
assert.strictEqual(bad.status, 400, 'senza cont deve rifiutare');

var r = await worker.fetch(new Request('https://p.example/?output=7&forceUserAgent=raiplayappletv&cont=2606803'));
assert.strictEqual(r.status, 302);
assert.strictEqual(r.headers.get('Access-Control-Allow-Origin'), '*');
var loc = r.headers.get('Location');
assert.match(loc, /^https:\/\/.+\.m3u8/);

// dopo un redirect cross-origin il browser manda Origin: null
var m = await fetch(loc, { headers: { Origin: 'null' } });
assert.strictEqual(m.status, 200);
assert.ok(m.headers.get('Access-Control-Allow-Origin'), 'Akamai deve rispondere col CORS');
assert.match(await m.text(), /^#EXTM3U/);
console.log('ok');
