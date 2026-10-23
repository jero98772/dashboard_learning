import React, { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { scaleUtc, scaleLinear, scaleBand, scaleSqrt } from 'd3-scale';
import { extent, min, max, sum, bisector } from 'd3-array';
import { format as d3format } from 'd3-format';
import { utcFormat } from 'd3-time-format';
import { csvStore } from './csvStore';
import './styles.css';

/* ---------- constants ---------- */
const TOPICS = [
  ['Quantum', 'quantum'], ['Thermodynamics', 'thermo'], ['Photonics', 'photonics'], ['LLVM', 'llvm'],
  ['Programming semantics', 'sem'], ['AI', 'ai'], ['LLM', 'llm'], ['Digital signal processing', 'dsp'],
  ['Open-source integration', 'os'], ['Build a company', 'co'], ['Math', 'math'],
];
const FORMATS = ['Conference', 'Video', 'Article', 'Book', 'Course', 'Script', 'Project'];
const MULT = { Conference: 1.5, Video: 1, Article: 1, Book: 1.2, Course: 1.5, Script: 1.5, Project: 2 };
const KEY = Object.fromEntries(TOPICS);
const col = (t) => 'var(--t-' + (KEY[t] || 'sem') + ')';
const fmt = d3format(',');
const pad = (n) => String(n).padStart(2, '0');
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const nowParts = () => {
  const d = new Date();
  return { date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), time: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
};
const byRecent = (a, b) => { const ka = a.date + a.time, kb = b.date + b.time; return ka < kb ? 1 : ka > kb ? -1 : 0; };

/* ---------- derived data ---------- */
function toScored(entries) {
  return entries.map((e) => {
    const m = Number(e.minutes) || 0;
    const f = e.format === 'Script project' ? 'Project' : e.format;
    return {
      id: e.id, date: String(e.date), time: String(e.time || '12:00').slice(0, 5), topic: e.topic, format: f,
      minutes: m, title: String(e.title || ''), sample: !!e.sample, xp: Math.round(m * (MULT[f] || 1)),
    };
  });
}

function derive(S) {
  const xp = sum(S, (r) => r.xp);
  const level = Math.floor(Math.sqrt(xp / 150)) + 1;
  const lo = 150 * (level - 1) * (level - 1), hi = 150 * level * level;
  const dates = new Set(S.map((r) => r.date));
  const today = nowParts().date;
  let t = Date.parse(today + 'T00:00:00Z');
  if (!dates.has(iso(t))) t -= 864e5;
  let streak = 0;
  while (dates.has(iso(t))) { streak++; t -= 864e5; }
  const explored = new Set(S.map((r) => r.topic + '|' + r.format)).size;
  return { xp, level, toNext: hi - xp, pct: Math.round(((xp - lo) / (hi - lo)) * 100), streak, days: dates.size, entries: S.length, explored, total: TOPICS.length * FORMATS.length, today };
}

function toCsv(S) {
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const rows = S.slice().sort((a, b) => { const ka = a.date + a.time, kb = b.date + b.time; return ka < kb ? -1 : ka > kb ? 1 : 0; });
  return ['date,time,topic,format,minutes,xp,title']
    .concat(rows.map((r) => [r.date, r.time, q(r.topic), q(r.format), r.minutes, r.xp, q(r.title)].join(',')))
    .join('\n') + '\n';
}

const SAMPLE_TITLES = {
  Quantum: ['Quantum error correction primer', 'Qubits and the Bloch sphere'],
  Thermodynamics: ['Entropy and the second law', 'Heat engines and the Carnot cycle'],
  Photonics: ['Silicon photonics waveguides', 'Mach-Zehnder interferometers'],
  LLVM: ['Writing an LLVM pass', 'LLVM IR in depth'],
  'Programming semantics': ['Operational semantics notes', 'Type systems and soundness'],
  AI: ['Reinforcement learning intro', 'Neural network optimization'],
  LLM: ['Transformer attention explained', 'Building an eval harness'],
  'Digital signal processing': ['FFT from scratch', 'FIR filter design'],
  'Open-source integration': ['Contributing to an upstream repo', 'Packaging a Python library'],
  'Build a company': ['Customer discovery interviews', 'Pricing and unit economics'],
  Math: ['Linear algebra refresher', 'Probability and Bayes'],
};

function sampleDocs() {
  let s = 7;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a, w) => { const tot = w.reduce((x, y) => x + y, 0); let r = rnd() * tot; for (let i = 0; i < a.length; i++) { r -= w[i]; if (r <= 0) return a[i]; } return a[a.length - 1]; };
  const tn = TOPICS.map((t) => t[0]);
  const tw = [6, 3, 4, 7, 4, 12, 12, 5, 6, 5, 8];
  const fw = [2, 30, 24, 10, 10, 8, 10];
  const mr = { Conference: [60, 240], Video: [20, 70], Article: [10, 40], Book: [30, 90], Course: [40, 120], Script: [20, 90], Project: [45, 180] };
  const hr = { Conference: [9, 16], Video: [19, 23], Article: [7, 13], Book: [21, 23], Course: [7, 20], Script: [18, 23], Project: [14, 23] };
  const out = [];
  const today = Date.parse(nowParts().date + 'T00:00:00Z');
  for (let ms = today - 88 * 864e5; ms <= today; ms += 864e5) {
    const wd = (new Date(ms).getUTCDay() + 6) % 7;
    if (rnd() < (wd < 5 ? 0.72 : 0.45)) {
      const k = [1, 1, 1, 2, 2, 3][Math.floor(rnd() * 6)];
      for (let j = 0; j < k; j++) {
        const t = pick(tn, tw), f = pick(FORMATS, fw), m = mr[f], hh = hr[f];
        const minutes = m[0] + 5 * Math.floor(rnd() * ((m[1] - m[0]) / 5 + 1));
        const H = hh[0] + Math.floor(rnd() * (hh[1] - hh[0] + 1));
        const M = 5 * Math.floor(rnd() * 12);
        out.push({ date: iso(ms), time: pad(H) + ':' + pad(M), topic: t, format: f, minutes, title: SAMPLE_TITLES[t][Math.floor(rnd() * 2)], sample: true, created: ms + j });
      }
    }
  }
  return out;
}

/* ---------- hooks ---------- */
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function useEntries() {
  const [st, setSt] = useState({ ref: csvStore, canWrite: true, entries: [], loaded: false, error: '' });
  useEffect(
    () => csvStore.onSnapshot(
      (snap) => setSt((s) => ({ ...s, entries: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loaded: true, error: '' })),
      () => setSt((s) => ({ ...s, error: 'Server not reachable. Run: npm run dev' })),
    ),
    [],
  );
  return st;
}

/* ---------- tooltip + toast ---------- */
const TipCtx = createContext({ show() {}, hide() {} });
const useTip = () => useContext(TipCtx);

/* ---------- shared pieces ---------- */
function Grid({ id, label, role, cell }) {
  return (
    <div className="mx" id={id} role={role} aria-label={label}>
      <div />
      {TOPICS.map((t) => (<div className="colh" key={t[0]}><span>{t[0]}</span></div>))}
      {FORMATS.map((f) => (
        <React.Fragment key={f}>
          <div className="rowh">{f}</div>
          {TOPICS.map((t) => cell(t[0], f))}
        </React.Fragment>
      ))}
    </div>
  );
}

function Tiles({ D }) {
  const tile = (k, v, n, bar) => (
    <div className="tile" key={k}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {bar != null && (<div className="bar"><i style={{ width: bar + '%' }} /></div>)}
      <div className="n">{n}</div>
    </div>
  );
  return (
    <div className="tiles">
      {tile('Level', String(D.level), fmt(D.toNext) + ' XP to next', D.pct)}
      {tile('Total XP', fmt(D.xp), 'minutes × format weight')}
      {tile('Streak', D.streak + ' d', 'days in a row')}
      {tile('Days learned', String(D.days), D.entries + ' entries')}
      {tile('Explored', Math.round((D.explored / D.total) * 100) + '%', (D.total - D.explored) + ' cells to go')}
    </div>
  );
}

function Banner({ S, loaded, db, canWrite, toast }) {
  const n = S.filter((r) => r.sample).length;
  const [busy, setBusy] = useState(false);
  const mode = n ? 'remove' : loaded && S.length === 0 ? 'load' : null;
  if (!mode) return null;
  const run = async () => {
    if (!db) return;
    setBusy(true);
    try {
      if (mode === 'load') {
        const docs = sampleDocs();
        for (let j = 0; j < docs.length; j += 10) {
          await Promise.all(docs.slice(j, j + 10).map((d, i) => db.doc('sample-' + (j + i)).set(d)));
        }
        toast('Sample data loaded');
      } else {
        const ids = S.filter((r) => r.sample).map((r) => r.id);
        for (let i = 0; i < ids.length; i += 10) {
          await Promise.all(ids.slice(i, i + 10).map((id) => db.doc(id).delete()));
        }
        toast('Samples removed');
      }
    } catch (e) { toast(mode === 'load' ? 'Could not load the samples' : 'Could not remove all samples'); }
    setBusy(false);
  };
  return (
    <div className="banner">
      <span>{mode === 'remove' ? n + ' sample entries are loaded so you can see the charts. They are not your data.' : 'Nothing logged yet. Log your first entry above, or preview the charts with sample data.'}</span>
      <button className="ghost" type="button" disabled={busy || !canWrite || !db} onClick={run}>{mode === 'remove' ? 'Remove samples' : 'Load sample data'}</button>
    </div>
  );
}

/* ---------- register matrix + form ---------- */
function Register({ S, coll, canWrite, toast }) {
  const [sel, setSel] = useState(null);
  const [date, setDate] = useState(() => nowParts().date);
  const [time, setTime] = useState(() => nowParts().time);
  const [minutes, setMinutes] = useState('30');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const counts = useMemo(() => {
    const c = {};
    S.forEach((r) => { const k = r.topic + '|' + r.format; c[k] = (c[k] || 0) + 1; });
    return c;
  }, [S]);

  const pick = (t, f) => {
    setSel({ t, f });
    setTime(nowParts().time);
    if (!date) setDate(nowParts().date);
  };

  const save = async () => {
    if (!sel || !coll) return;
    const min = Number(minutes);
    if (!(min > 0)) { toast('Enter the minutes first'); return; }
    setSaving(true);
    try {
      await coll.add({ date: date || nowParts().date, time: time || nowParts().time, topic: sel.t, format: sel.f, minutes: min, title: title.trim(), created: Date.now() });
      toast('Logged +' + Math.round(min * (MULT[sel.f] || 1)) + ' XP');
      setTitle('');
    } catch (e) {
      toast(e && e.code === 'quota_exceeded' ? 'Storage is full' : 'Could not save, try again');
    }
    setSaving(false);
  };

  return (
    <section className="card" aria-labelledby="h-reg">
      <h2 id="h-reg">Log what you learned</h2>
      <p className="note">Tap a topic and format, set the minutes, save. Every entry is stored and can be downloaded as a CSV below.</p>
      <div className="mxwrap">
        <Grid id="mx-reg" role="group" label="Register matrix" cell={(t, f) => {
          const n = counts[t + '|' + f] || 0;
          return (
            <button key={t + f} type="button" className="cell" style={{ '--c': col(t) }}
              aria-label={f + ' for ' + t + ', ' + n + ' logged'}
              aria-pressed={!!sel && sel.t === t && sel.f === f}
              onClick={() => pick(t, f)}>{n ? String(n) : '+'}</button>
          );
        }} />
      </div>
      <div className="panel">
        <div className="pick">
          <i style={{ background: sel ? col(sel.t) : 'var(--ink-2)' }} />
          <span>{sel ? sel.t + '  ·  ' + sel.f : 'Pick a cell above'}</span>
        </div>
        <div className="fields">
          <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          <label>Minutes<input type="number" min="1" max="1440" step="5" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
          <label className="wide">What did you read, watch or build?
            <input type="text" placeholder="e.g. LLVM IR in depth" maxLength={140} autoComplete="off" value={title}
              onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
          </label>
          <button className="primary" type="button" disabled={!sel || !canWrite || !coll || saving} onClick={save}>Log it</button>
        </div>
        <div className="chips">
          {[15, 30, 60, 90, 120].map((m) => (<button key={m} type="button" onClick={() => setMinutes(String(m))}>{m + ' min'}</button>))}
        </div>
      </div>
    </section>
  );
}

/* ---------- visual matrix ---------- */
function VizMatrix({ S }) {
  const tip = useTip();
  const by = useMemo(() => {
    const m = {};
    S.forEach((r) => { const k = r.topic + '|' + r.format; const o = m[k] || (m[k] = { n: 0, xp: 0, items: [] }); o.n++; o.xp += r.xp; o.items.push(r); });
    return m;
  }, [S]);
  const top = max(Object.values(by), (o) => o.xp) || 1;
  return (
    <section className="card" aria-labelledby="h-viz">
      <h2 id="h-viz">Skill matrix</h2>
      <p className="note">Same grid, read-only. Stronger color means more XP. Dashed cells are still unexplored.</p>
      <div className="mxwrap">
        <Grid id="mx-viz" role="img" label="Skill matrix of XP by topic and format" cell={(t, f) => {
          const o = by[t + '|' + f];
          if (!o) {
            return <div key={t + f} className="cell empty" onMouseMove={(e) => tip.show(e, [t + ' · ' + f, 'Unexplored'])} onMouseLeave={tip.hide} />;
          }
          const pct = Math.round(18 + 82 * Math.sqrt(o.xp / top));
          const last = o.items.slice().sort(byRecent).slice(0, 3).map((r) => r.date + '  ' + r.title);
          return (
            <div key={t + f} className="cell" style={{ background: 'color-mix(in srgb, ' + col(t) + ' ' + pct + '%, transparent)', borderColor: col(t) }}
              onMouseMove={(e) => tip.show(e, [t + ' · ' + f, o.n + ' entries · ' + fmt(o.xp) + ' XP', ...last])} onMouseLeave={tip.hide}>{o.n}</div>
          );
        }} />
      </div>
    </section>
  );
}

/* ---------- charts ---------- */
function YAxis({ ticks, y, m, W, label }) {
  return ticks.map((v) => (
    <g key={v}>
      <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--grid)' }} />
      <text x={m.l - 8} y={y(v) + 4} textAnchor="end">{label(v)}</text>
    </g>
  ));
}

function Timeline({ S, today }) {
  const [ref, w] = useWidth();
  const tip = useTip();
  let body = null;
  if (!S.length) {
    body = <div className="empty-state">Entries appear here once you log something.</div>;
  } else if (w > 0) {
    const W = Math.max(w, 300), H = 320, m = { l: 50, r: 12, t: 10, b: 26 };
    const P = S.map((r) => { const p = r.time.split(':'); return { ...r, d: new Date(r.date + 'T00:00:00Z'), hr: Number(p[0]) + (Number(p[1]) || 0) / 60 }; });
    const x = scaleUtc().domain([min(P, (p) => p.d), new Date(today + 'T00:00:00Z')]).range([m.l + 8, W - m.r - 4]);
    const h0 = Math.max(0, Math.floor(min(P, (p) => p.hr)) - 1), h1 = Math.min(24, Math.ceil(max(P, (p) => p.hr)) + 1);
    const y = scaleLinear().domain([h0, h1]).range([m.t, H - m.b]);
    const rad = scaleSqrt().domain([0, max(P, (p) => p.minutes) || 1]).range([3.5, 9]);
    const hours = []; for (let v = h0; v <= h1; v++) if (v % 2 === 0) hours.push(v);
    body = (
      <svg width="100%" viewBox={'0 0 ' + W + ' ' + H}>
        <YAxis ticks={hours} y={y} m={m} W={W} label={(v) => pad(v) + ':00'} />
        {x.ticks(Math.max(2, Math.floor(W / 95))).map((t) => (<text key={+t} x={x(t)} y={H - 6} textAnchor="middle">{utcFormat('%b %-d')(t)}</text>))}
        {P.map((p) => (
          <circle key={p.id} cx={x(p.d)} cy={y(p.hr)} r={rad(p.minutes)} fillOpacity=".85" strokeWidth="1.5"
            style={{ fill: col(p.topic), stroke: 'var(--panel)' }}
            onMouseMove={(e) => tip.show(e, [p.title || '(untitled)', p.topic + ' · ' + p.format, utcFormat('%a %b %-d')(p.d) + ' at ' + p.time + ' · ' + p.minutes + ' min'])}
            onMouseLeave={tip.hide} />
        ))}
      </svg>
    );
  }
  return <div ref={ref}>{body}</div>;
}

function Cumulative({ S, today }) {
  const [ref, w] = useWidth();
  const tip = useTip();
  let body = null;
  if (!S.length) body = <div className="empty-state">No data yet.</div>;
  else if (w > 0) {
    const by = {}; S.forEach((r) => { by[r.date] = (by[r.date] || 0) + r.xp; });
    const first = Date.parse(min(S, (r) => r.date) + 'T00:00:00Z'), last = Date.parse(today + 'T00:00:00Z');
    let run = 0; const pts = [];
    for (let ms = first; ms <= last; ms += 864e5) { run += by[iso(ms)] || 0; pts.push({ d: new Date(ms), v: run }); }
    if (pts.length < 2) pts.push({ d: new Date(last + 864e5), v: run });
    const W = Math.max(w, 260), H = 200, m = { l: 48, r: 50, t: 10, b: 24 };
    const x = scaleUtc().domain(extent(pts, (p) => p.d)).range([m.l, W - m.r]);
    const y = scaleLinear().domain([0, run || 1]).nice().range([H - m.b, m.t]);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + x(p.d).toFixed(1) + ',' + y(p.v).toFixed(1)).join('');
    const l = pts[pts.length - 1];
    const bis = bisector((p) => p.d).center;
    body = (
      <svg width="100%" viewBox={'0 0 ' + W + ' ' + H}>
        <YAxis ticks={y.ticks(4)} y={y} m={m} W={W} label={(v) => fmt(v)} />
        {x.ticks(Math.max(2, Math.floor(W / 110))).map((t) => (<text key={+t} x={x(t)} y={H - 6} textAnchor="middle">{utcFormat('%b %-d')(t)}</text>))}
        <path d={path} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: 'var(--ink)' }} />
        <circle cx={x(l.d)} cy={y(l.v)} r="3.5" style={{ fill: 'var(--ink)' }} />
        <text x={x(l.d) + 7} y={y(l.v) + 4}>{fmt(l.v)}</text>
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="transparent"
          onMouseMove={(e) => {
            const b = e.currentTarget.ownerSVGElement.getBoundingClientRect();
            const p = pts[bis(pts, x.invert(((e.clientX - b.left) * W) / b.width))];
            tip.show(e, [utcFormat('%b %-d')(p.d), fmt(p.v) + ' XP total']);
          }} onMouseLeave={tip.hide} />
      </svg>
    );
  }
  return <div ref={ref}>{body}</div>;
}

function Weekdays({ S }) {
  const [ref, w] = useWidth();
  const tip = useTip();
  let body = null;
  if (!S.length) body = <div className="empty-state">No data yet.</div>;
  else if (w > 0) {
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const seen = new Set(), c = [0, 0, 0, 0, 0, 0, 0];
    S.forEach((r) => { if (!seen.has(r.date)) { seen.add(r.date); c[(new Date(r.date + 'T00:00:00Z').getUTCDay() + 6) % 7]++; } });
    const W = Math.max(w, 240), H = 200, m = { l: 32, r: 6, t: 10, b: 24 };
    const x = scaleBand().domain(names).range([m.l, W - m.r]).padding(0.3);
    const y = scaleLinear().domain([0, Math.max(3, max(c))]).nice().range([H - m.b, m.t]);
    body = (
      <svg width="100%" viewBox={'0 0 ' + W + ' ' + H}>
        <YAxis ticks={y.ticks(4).filter(Number.isInteger)} y={y} m={m} W={W} label={(v) => v} />
        {names.map((n, i) => (
          <g key={n}>
            <rect x={x(n)} y={y(c[i])} width={x.bandwidth()} height={y(0) - y(c[i])} rx="4" fillOpacity=".85" style={{ fill: 'var(--ink)' }}
              onMouseMove={(e) => tip.show(e, [n, c[i] + ' active days'])} onMouseLeave={tip.hide} />
            <text x={x(n) + x.bandwidth() / 2} y={H - 6} textAnchor="middle">{n}</text>
          </g>
        ))}
      </svg>
    );
  }
  return <div ref={ref}>{body}</div>;
}

function TopicBars({ S }) {
  const [ref, w] = useWidth();
  const tip = useTip();
  let body = null;
  if (!S.length) body = <div className="empty-state">No data yet.</div>;
  else if (w > 0) {
    const by = {};
    S.forEach((r) => { const o = by[r.topic] || (by[r.topic] = { t: r.topic, xp: 0, n: 0 }); o.xp += r.xp; o.n++; });
    const rows = Object.values(by).sort((a, b) => b.xp - a.xp);
    const W = Math.max(w, 260), bh = 18, gap = 7, left = 150, H = rows.length * (bh + gap) + 4;
    const x = scaleLinear().domain([0, rows[0].xp || 1]).range([0, Math.max(W - left - 48, 10)]);
    body = (
      <svg width="100%" viewBox={'0 0 ' + W + ' ' + H}>
        {rows.map((r, i) => {
          const yy = 2 + i * (bh + gap);
          return (
            <g key={r.t}>
              <text x={left - 8} y={yy + bh / 2 + 4} textAnchor="end">{r.t.length > 22 ? r.t.slice(0, 21) + '…' : r.t}</text>
              <rect x={left} y={yy} width={Math.max(x(r.xp), 2)} height={bh} rx="4" style={{ fill: col(r.t) }}
                onMouseMove={(e) => tip.show(e, [r.t, fmt(r.xp) + ' XP · ' + r.n + ' entries'])} onMouseLeave={tip.hide} />
              <text x={left + x(r.xp) + 6} y={yy + bh / 2 + 4}>{fmt(r.xp)}</text>
            </g>
          );
        })}
      </svg>
    );
  }
  return <div ref={ref}>{body}</div>;
}

/* ---------- latest entries ---------- */
function RemoveButton({ r, coll, canWrite, toast }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const click = async () => {
    if (!armed) { setArmed(true); timer.current = setTimeout(() => setArmed(false), 3000); return; }
    clearTimeout(timer.current);
    setBusy(true);
    try { await coll.doc(r.id).delete(); toast('Entry removed'); }
    catch (e) { toast('Could not remove it'); setBusy(false); setArmed(false); }
  };
  return (
    <button className="ghost" type="button" style={{ padding: '4px 10px', borderColor: armed ? 'var(--t-math)' : undefined }}
      aria-label={'Remove entry ' + (r.title || r.topic)} disabled={!canWrite || !coll || busy} onClick={click}>
      {armed ? 'Confirm' : 'Remove'}
    </button>
  );
}

function Latest({ S, coll, canWrite, toast }) {
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => S.slice().sort(byRecent), [S]);
  const rows = all ? sorted : sorted.slice(0, 8);

  const download = () => {
    const a = document.createElement('a');
    a.href = '/api/csv';
    a.download = 'learning-log.csv';
    a.click();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(toCsv(S)); toast('CSV copied'); }
    catch (e) { toast('Copy is blocked here, use Download'); }
  };

  return (
    <section className="card" aria-labelledby="h-last">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h2 id="h-last">Latest entries</h2>
          <p className="note" style={{ marginBottom: 0 }}>Your most recent entries. Press Remove twice to delete one.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="ghost" type="button" onClick={download}>Download CSV</button>
          <button className="ghost" type="button" onClick={copy}>Copy CSV</button>
        </div>
      </div>
      <div className="tblwrap" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Topic</th><th>Format</th><th>What</th><th>XP</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="m">{r.date}</td>
                <td className="m">{r.time}</td>
                <td><i className="dot" style={{ background: col(r.topic) }} />{r.topic}</td>
                <td>{r.format}</td>
                <td>{r.title}</td>
                <td className="m">{fmt(r.xp)}</td>
                <td><RemoveButton r={r} coll={coll} canWrite={canWrite} toast={toast} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {S.length === 0 && (<div className="empty-state">No entries yet. Pick a cell in the register to log your first one.</div>)}
      {sorted.length > 8 && (
        <button className="ghost" type="button" style={{ marginTop: 12 }} onClick={() => setAll((v) => !v)}>
          {all ? 'Show only the latest 8' : 'Show all ' + sorted.length + ' entries'}
        </button>
      )}
    </section>
  );
}

/* ---------- app ---------- */
function App() {
  const { ref: coll, canWrite, entries, loaded, error } = useEntries();
  const S = useMemo(() => toScored(entries), [entries]);
  const D = useMemo(() => derive(S), [S]);

  const wrapRef = useRef(null);
  const [tip, setTip] = useState(null);
  const show = useCallback((ev, lines) => {
    const r = wrapRef.current.getBoundingClientRect();
    const x = Math.max(4, Math.min(ev.clientX - r.left + 14, r.width - 284));
    setTip({ x, y: ev.clientY - r.top + 16, lines });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const tipApi = useMemo(() => ({ show, hide }), [show, hide]);

  const [toastText, setToastText] = useState('');
  const toastTimer = useRef(null);
  const toast = useCallback((t) => {
    setToastText(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(''), 2200);
  }, []);

  const status = error || (loaded ? 'LVL ' + pad(D.level) + '  ·  ' + fmt(D.xp) + ' XP  ·  ' + D.streak + '-day streak' : 'Loading your log');

  return (
    <TipCtx.Provider value={tipApi}>
      <div className="wrap" ref={wrapRef}>
        <header>
          <h1>Learning Quest</h1>
          <p className="sub">{status}</p>
        </header>

        <Tiles D={D} />
        <Banner S={S} loaded={loaded} db={coll} canWrite={canWrite} toast={toast} />
        <Register S={S} coll={coll} canWrite={canWrite} toast={toast} />
        <VizMatrix S={S} />

        <section className="card" aria-labelledby="h-time">
          <h2 id="h-time">Learning timeline</h2>
          <p className="note">One dot per entry: the day across, the time of day up and down. Bigger dot, more minutes. Hover for the title.</p>
          <div className="legend">
            {TOPICS.map((t) => (<span key={t[0]}><i style={{ background: col(t[0]) }} />{t[0]}</span>))}
          </div>
          <Timeline S={S} today={D.today} />
        </section>

        <div className="grid3">
          <section className="card"><h2>Cumulative XP</h2><p className="note">Total XP over time.</p><Cumulative S={S} today={D.today} /></section>
          <section className="card"><h2>Best weekdays</h2><p className="note">Days with at least one entry.</p><Weekdays S={S} /></section>
          <section className="card"><h2>XP by topic</h2><p className="note">Where the effort went.</p><TopicBars S={S} /></section>
        </div>

        <Latest S={S} coll={coll} canWrite={canWrite} toast={toast} />

        {tip && (
          <div className="tip" style={{ left: tip.x, top: tip.y }}>
            {tip.lines.map((l, i) => (<div key={i} style={i === 0 ? { fontWeight: 600 } : { color: 'var(--ink-2)' }}>{l}</div>))}
          </div>
        )}
      </div>
      {toastText && (<div className="toast" role="status">{toastText}</div>)}
    </TipCtx.Provider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
