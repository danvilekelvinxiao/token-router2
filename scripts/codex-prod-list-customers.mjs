import fs from "node:fs";

function loadEnv(file) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv(".env.production");

const { query } = await import("../lib/db.js");
const rows = await query("SELECT id, email, email_verified, balance, total_spend, created_at FROM customers ORDER BY created_at DESC LIMIT 10", []);
console.log(JSON.stringify(rows?.rows || null, null, 2));
