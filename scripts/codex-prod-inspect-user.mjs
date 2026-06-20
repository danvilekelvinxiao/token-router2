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
const email = process.argv[2];
const { query } = await import('../lib/db.js');
const { rows } = await query(
  `SELECT id, email, email_verified, status, balance, total_spend, length(password_hash) AS password_hash_len, created_at
   FROM customers WHERE email = $1 LIMIT 1`,
  [email]
);
console.log(JSON.stringify(rows[0] || null, null, 2));
