// Talks to server.js, which keeps everything in data/learning-log.csv.
// It exposes the same small surface the app used before: add, doc(id).set/delete, onSnapshot.
let docs = [];
let pending = null;
const listeners = new Set();

async function load() {
  const r = await fetch('/api/entries');
  if (!r.ok) throw new Error('load failed');
  docs = await r.json();
  listeners.forEach((l) => l.next(snapshot()));
}

// One refresh at a time, so a burst of writes causes a single reload.
function refresh() {
  if (!pending) pending = load().finally(() => { pending = null; });
  return pending;
}

function snapshot() {
  return {
    docs: docs.map((d) => ({
      id: d.id,
      data: () => { const { id, ...rest } = d; return rest; },
    })),
  };
}

async function post(body) {
  const r = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('save failed');
  await refresh();
}

export const csvStore = {
  add: (doc) => post(doc),
  doc: (id) => ({
    set: (doc) => post({ ...doc, id }),
    delete: async () => {
      const r = await fetch('/api/entries/' + encodeURIComponent(id), { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed');
      await refresh();
    },
  }),
  onSnapshot(next, error) {
    const l = { next, error };
    listeners.add(l);
    refresh().catch(() => error && error());
    // Pick up edits made directly to the CSV file.
    const timer = setInterval(() => refresh().catch(() => error && error()), 5000);
    return () => { listeners.delete(l); clearInterval(timer); };
  },
};
