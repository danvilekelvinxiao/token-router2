import fs from 'node:fs';
function loadEnv(file) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv('.env.production');
const { listModelProductsWithConfig } = await import('../lib/model-products-server.js');
const rows = await listModelProductsWithConfig({ includeUnavailable: true });
console.log(JSON.stringify(rows.filter((m) => String(m.publicModelId).includes('gpt') || String(m.id).includes('gpt')).map((m) => ({ id: m.id, publicModelId: m.publicModelId, displayName: m.displayName, isAvailable: m.isAvailable, actualModelId: m.actualModelId })), null, 2));
