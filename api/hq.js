// واجهة حلقات أبوبكر الصديق: مزامنة المعلمين وتسجيل دخول المشرف.
// تستعمل قاعدة Upstash نفسها المربوطة بالمشروع، لكن كل شيء هنا محمي برموز:
//  - المشرف: كلمة سر في متغير بيئي اسمه SUPERVISOR_PASSWORD (تضبطه في Vercel).
//  - المعلم: رمز خاص ينشئه المشرف من التطبيق، ولا يُخزَّن منه إلا بصمته (hash).
// ملاحظة: هذه الواجهة منفصلة عن /api/kv ولا تفتح بيانات الحلقات لأحد.
import crypto from 'crypto';

const REST = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function pipe(cmds) {
  const r = await fetch(REST() + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN(), 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error('upstash');
  return j.map((x) => { if (x && x.error) throw new Error(x.error); return x.result; });
}
const cmd = async (c) => (await pipe([c]))[0];

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeEq = (a, b) => crypto.timingSafeEqual(Buffer.from(sha(a), 'hex'), Buffer.from(sha(b), 'hex'));
const idOk = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(s);
const dateOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const MAX_HALAQA = 900 * 1024;
const DEFAULT_MSG = 'نود إخطاركم بغياب ابنكم اليوم الموافق {التاريخ}، شاكرين لكم حرصكم وتعاونكم.\nإدارة حلقات أبوبكر الصديق';

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += A[b[i] % A.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}

async function failed(ip) {
  try {
    const k = 'hq:rl:' + ip;
    const [n] = await pipe([['INCR', k], ['EXPIRE', k, 900]]);
    return n;
  } catch (e) { return 0; }
}
async function blocked(ip) {
  try { const n = await cmd(['GET', 'hq:rl:' + ip]); return Number(n || 0) >= 20; } catch (e) { return false; }
}

async function teacherOf(code) {
  if (typeof code !== 'string' || code.length < 8 || code.length > 40) return null;
  const v = await cmd(['HGET', 'hq:codes', sha(code.trim().toUpperCase())]);
  return v ? JSON.parse(v) : null;
}
const isSup = (pw) => {
  const real = process.env.SUPERVISOR_PASSWORD;
  return !!real && typeof pw === 'string' && pw.length > 0 && pw.length < 200 && safeEq(pw, real);
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!REST() || !TOKEN()) return res.status(500).json({ error: 'لم يتم ربط قاعدة البيانات بالمشروع.' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'x').trim();
  try {
    if (await blocked(ip)) return res.status(429).json({ error: 'محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة.' });
    const a = b.a;

    /* ---------- المعلم ---------- */
    if (a === 'ping' || a === 'sync') {
      const t = await teacherOf(b.code);
      if (!t) { await failed(ip); return res.status(401).json({ error: 'الرمز غير صحيح.' }); }
      if (a === 'ping') return res.json({ ok: true, name: t.name });
      const hs = Array.isArray(b.halaqat) ? b.halaqat : null;
      if (!hs || hs.length > 40) return res.status(400).json({ error: 'بيانات غير صالحة.' });
      const cmds = [];
      const ids = [];
      const at = Date.now();
      for (const h of hs) {
        if (!h || !idOk(h.id) || typeof h.name !== 'string' || !Array.isArray(h.students)) return res.status(400).json({ error: 'بيانات غير صالحة.' });
        const val = JSON.stringify({ at, h });
        if (val.length > MAX_HALAQA) return res.status(413).json({ error: 'حجم حلقة «' + h.name + '» كبير جداً.' });
        ids.push(h.id);
        cmds.push(['SET', 'hq:h:' + t.id + ':' + h.id, val]);
        cmds.push(['SADD', 'hq:th:' + t.id, h.id]);
      }
      const old = (await cmd(['SMEMBERS', 'hq:th:' + t.id])) || [];
      for (const o of old) if (!ids.includes(o)) { cmds.push(['DEL', 'hq:h:' + t.id + ':' + o]); cmds.push(['SREM', 'hq:th:' + t.id, o]); }
      cmds.push(['HSET', 'hq:last', t.id, String(at)]);
      await pipe(cmds);
      return res.json({ ok: true, at });
    }

    /* ---------- المشرف ---------- */
    if (!process.env.SUPERVISOR_PASSWORD) return res.status(500).json({ error: 'لم تُضبط كلمة سر المشرف في Vercel (SUPERVISOR_PASSWORD).' });
    if (!isSup(b.pw)) { await failed(ip); return res.status(401).json({ error: 'كلمة السر غير صحيحة.' }); }

    if (a === 'list') {
      const [codes, msg] = await pipe([['HGETALL', 'hq:codes'], ['GET', 'hq:msg']]);
      const teachers = [];
      for (let i = 0; i < (codes || []).length; i += 2) { const t = JSON.parse(codes[i + 1]); teachers.push({ id: t.id, name: t.name, halaqat: [], at: 0 }); }
      for (const t of teachers) {
        const hids = (await cmd(['SMEMBERS', 'hq:th:' + t.id])) || [];
        if (!hids.length) continue;
        const vals = await pipe(hids.map((h) => ['GET', 'hq:h:' + t.id + ':' + h]));
        vals.forEach((v) => { if (!v) return; const o = JSON.parse(v); t.halaqat.push(o.h); t.at = Math.max(t.at, o.at || 0); });
      }
      return res.json({ ok: true, teachers, msg: msg || DEFAULT_MSG, now: Date.now() });
    }
    if (a === 'tadd') {
      const name = String(b.name || '').trim().slice(0, 60);
      if (!name) return res.status(400).json({ error: 'اكتب اسم المعلم.' });
      const code = newCode(), id = crypto.randomBytes(5).toString('hex');
      await cmd(['HSET', 'hq:codes', sha(code), JSON.stringify({ id, name, created: Date.now() })]);
      return res.json({ ok: true, id, name, code });
    }
    if (a === 'tdel') {
      if (!idOk(b.id)) return res.status(400).json({ error: 'id' });
      const all = (await cmd(['HGETALL', 'hq:codes'])) || [];
      const cmds = [];
      for (let i = 0; i < all.length; i += 2) if (JSON.parse(all[i + 1]).id === b.id) cmds.push(['HDEL', 'hq:codes', all[i]]);
      const hids = (await cmd(['SMEMBERS', 'hq:th:' + b.id])) || [];
      hids.forEach((h) => cmds.push(['DEL', 'hq:h:' + b.id + ':' + h]));
      cmds.push(['DEL', 'hq:th:' + b.id]);
      await pipe(cmds);
      return res.json({ ok: true });
    }
    if (a === 'cfgset') {
      const msg = String(b.msg || '').slice(0, 600);
      await cmd(msg ? ['SET', 'hq:msg', msg] : ['DEL', 'hq:msg']);
      return res.json({ ok: true, msg: msg || DEFAULT_MSG });
    }
    if (a === 'attget') {
      if (!dateOk(b.date)) return res.status(400).json({ error: 'date' });
      const h = (await cmd(['HGETALL', 'hq:att:' + b.date])) || [];
      const marks = {};
      for (let i = 0; i < h.length; i += 2) marks[h[i]] = JSON.parse(h[i + 1]);
      return res.json({ ok: true, marks });
    }
    if (a === 'attset') {
      if (!dateOk(b.date) || !b.marks || typeof b.marks !== 'object') return res.status(400).json({ error: 'date' });
      const cmds = [];
      for (const [k, v] of Object.entries(b.marks)) {
        if (!/^[A-Za-z0-9_:-]{1,100}$/.test(k)) continue;
        if (v === null) cmds.push(['HDEL', 'hq:att:' + b.date, k]);
        else if (v && (v.s === 'a' || v.s === 'p')) cmds.push(['HSET', 'hq:att:' + b.date, k, JSON.stringify({ s: v.s, n: v.n ? 1 : 0 })]);
      }
      if (cmds.length) { cmds.push(['EXPIRE', 'hq:att:' + b.date, 60 * 60 * 24 * 400]); await pipe(cmds); }
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: 'action' });
  } catch (e) {
    return res.status(500).json({ error: 'تعذّر الاتصال بقاعدة البيانات.' });
  }
}
