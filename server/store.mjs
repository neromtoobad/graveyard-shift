// Plots live in one JSON file on the Railway volume. Small, durable, easy to inspect.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.DATA_DIR || path.join(here, '..', 'data');
const FILE = path.join(DIR, 'plots.json');
fs.mkdirSync(DIR, { recursive: true });

let db = { plots: [], events: [] };
if (fs.existsSync(FILE)) {
  db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} else {
  const seed = path.join(here, 'seed.json');
  if (fs.existsSync(seed)) db.plots = JSON.parse(fs.readFileSync(seed, 'utf8'));
  save();
}
db.events ||= [];

function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, FILE);
}

export const plots = () => db.plots;
export const plot = (id) => db.plots.find((p) => p.id === id);

export function addPlot(p) {
  db.plots.unshift(p);
  save();
  return p;
}

export function updatePlot(id, patch) {
  const p = plot(id);
  if (!p) return null;
  Object.assign(p, patch);
  save();
  return p;
}

export function log(kind, data) {
  db.events.unshift({ at: new Date().toISOString(), kind, ...data });
  db.events = db.events.slice(0, 300);
  save();
}

export const events = () => db.events;

export function slugify(s) {
  const base = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'plot';
  let slug = base;
  for (let i = 2; plot(slug); i++) slug = `${base}-${i}`;
  return slug;
}
