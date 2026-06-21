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
const customerId = process.argv[2];
const { query } = await import('../lib/db.js');
await query(`INSERT INTO user_wallets (user_id, usd_token_balance, usd_token_total_obtained, usd_token_total_used, usd_token_bonus_total, usd_token_referral_total, cny_recharge_total, cny_paid_total, cny_refund_total)
            VALUES ($1, 1, 1, 0, 0, 0, 0, 0, 0)
            ON CONFLICT (user_id) DO UPDATE SET usd_token_balance = 1, usd_token_total_obtained = GREATEST(user_wallets.usd_token_total_obtained, 1), updated_at = NOW()`, [customerId]);
await query('DELETE FROM temporary_credits WHERE customer_id = $1', [customerId]);
await query('DELETE FROM wallet_transactions WHERE user_id = $1', [customerId]);
await query('DELETE FROM calls WHERE customer_id = $1', [customerId]);
console.log(JSON.stringify({ ok: true, customerId }, null, 2));
