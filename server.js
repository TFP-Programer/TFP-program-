// TFP PROGRAMI sunucusu: Gmail kodlu hesap + WebSocket anlık veri
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 3000;
const DIR = process.env.DATA_DIR || __dirname;
const FILE = path.join(DIR, 'data.json');
let db = { accounts: {}, emails: {}, kv: {}, sessions: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (e) {}
let st; const save = () => { clearTimeout(st); st = setTimeout(() => { const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(db)); fs.renameSync(t, FILE); }, 800); };

const mailer = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } }) : null;
if (!mailer) console.log('[UYARI] GMAIL_USER / GMAIL_APP_PASSWORD yok: kodlar sadece bu konsola yazılır (test modu).');

const codes = {}, hits = {};
const limit = (key, n, ms) => { const now = Date.now(); hits[key] = (hits[key] || []).filter(t => now - t < ms); if (hits[key].length >= n) return false; hits[key].push(now); return true; };
const normMail = e => { const m = String(e).trim().toLowerCase().match(/^([a-z0-9._+-]+)@(gmail\.com|googlemail\.com)$/); return m ? m[1].split('+')[0].replace(/\./g, '') + '@gmail.com' : null; };
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
const checkPw = (pw, h) => { try { const [s, x] = h.split(':'); return crypto.timingSafeEqual(Buffer.from(x), Buffer.from(crypto.scryptSync(pw, s, 32).toString('hex'))); } catch (e) { return false; } };
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');

const clients = new Set();
const broadcast = m => { const s = JSON.stringify(m); for (const c of clients) if (c.readyState === 1) c.send(s); };
const setKV = (k, v) => { db.kv[k] = v; broadcast({ o: 's', k, v }); save(); };
const delKV = k => { delete db.kv[k]; broadcast({ o: 'd', k }); save(); };
const newToken = u => { const t = crypto.randomBytes(32).toString('hex'); db.sessions[t] = u; save(); return t; };

const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
const body = req => new Promise(r => { let b = ''; req.on('data', d => { b += d; if (b.length > 5000) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(b)); } catch (e) { r({}); } }); });
const ip = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api/')) {
    const b = await body(req), a = req.url.slice(5);
    if (a === 'send-code') {
      const e = normMail(b.email);
      if (!e) return json(res, 400, { error: 'gmail' });
      if (db.emails[e]) return json(res, 400, { error: 'email_used' });
      if (!limit('c' + ip(req), 8, 3600e3) || !limit('c' + e, 3, 3600e3)) return json(res, 429, { error: 'rate' });
      const code = String(crypto.randomInt(100000, 1000000));
      codes[e] = { h: sha(code), exp: Date.now() + 600e3, tries: 0 };
      try {
        if (mailer) await mailer.sendMail({ from: 'TFP PROGRAMI <' + process.env.GMAIL_USER + '>', to: String(b.email).trim(), subject: 'TFP PROGRAMI doğrulama kodu', text: 'Doğrulama kodun: ' + code + '\n10 dakika geçerlidir. Bu kodu kimseyle paylaşma.' });
        else console.log('[TEST] ' + e + ' kodu: ' + code);
      } catch (err) { console.error('mail hatası:', err.message); return json(res, 500, { error: 'mail' }); }
      return json(res, 200, { ok: 1 });
    }
    if (a === 'register') {
      const e = normMail(b.email), u = String(b.username || ''), pw = String(b.password || ''), c = codes[e];
      if (!e || !/^[\w.-]{3,16}$/.test(u) || pw.length < 6 || pw.length > 100) return json(res, 400, { error: 'invalid' });
      if (!c || c.exp < Date.now() || c.tries >= 5) return json(res, 400, { error: 'code' });
      if (sha(b.code) !== c.h) { c.tries++; return json(res, 400, { error: 'code' }); }
      if (db.emails[e]) return json(res, 400, { error: 'email_used' });
      if (Object.keys(db.accounts).some(n => n.toLowerCase() === u.toLowerCase())) return json(res, 400, { error: 'user' });
      db.accounts[u] = { email: e, pw: hashPw(pw), created: Date.now() }; db.emails[e] = u; delete codes[e];
      setKV('tfp_acc_' + u, 1); setKV('tfp_prof_' + u, db.accounts[u].created);
      return json(res, 200, { token: newToken(u), username: u });
    }
    if (a === 'login') {
      const u = String(b.username || '');
      if (!limit('l' + ip(req), 30, 600e3) || !limit('u' + u.toLowerCase(), 10, 600e3)) return json(res, 429, { error: 'rate' });
      const n = Object.keys(db.accounts).find(x => x.toLowerCase() === u.toLowerCase()), ac = n && db.accounts[n];
      if (!ac || !checkPw(String(b.password || ''), ac.pw)) return json(res, 401, { error: 'bad' });
      return json(res, 200, { token: newToken(n), username: n });
    }
    if (a === 'logout') { delete db.sessions[b.token]; save(); return json(res, 200, { ok: 1 }); }
    return json(res, 404, { error: 'nf' });
  }
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?') || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    return res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
  }
  if (req.url === '/healthz') return res.end('ok');
  res.writeHead(404); res.end('404');
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  const user = db.sessions[token];
  if (!user) return ws.close(4001);
  clients.add(ws);
  ws.send(JSON.stringify({ o: 'snap', d: db.kv }));
  ws.on('close', () => clients.delete(ws));
  ws.on('message', raw => {
    if (!limit('w' + user, 80, 5000)) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const k = String(m.k || '');
    if (!/^[\w.:@+~-]{1,200}$/.test(k) || /^tfp_(acc|prof)_/.test(k)) return;               // hesap verisini sadece sunucu yazar
    if (/^tfp_msg_/.test(k) && m.o === 's' && m.v && !m.v.s && m.v.u !== user) return;      // başkası adına mesaj yok
    if (/^tfp_p_/.test(k) && !k.endsWith('_' + user)) return;                               // başkası adına varlık sinyali yok
    if (/^tfp_(inv|freq):/.test(k)) {
      if (m.o === 's' && !(m.v && m.v.from === user)) return;                               // davet/istek gönderen = sen
      if (m.o === 'd') { const o = db.kv[k]; if (!o || (o.from !== user && o.to !== user)) return; }
    }
    if (m.o === 's') { if (JSON.stringify(m.v).length > 20000) return; setKV(k, m.v); }
    else if (m.o === 'd') delKV(k);
  });
});
setInterval(() => wss.clients.forEach(c => c.ping()), 30000);
server.listen(PORT, () => console.log('TFP PROGRAMI çalışıyor: http://localhost:' + PORT));
