// Load ../.env for local runs (Railway injects real env vars, which win).
import fs from 'node:fs';
const f = new URL('../.env', import.meta.url);
if (fs.existsSync(f)) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
