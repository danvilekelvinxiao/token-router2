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
const calls = await query(
  "SELECT id, request_id, public_model_id, actual_model_id, input_tokens, output_tokens, total_tokens, user_charge, wallet_deduct_amount, package_deduct_amount, upstream_cost, profit, created_at FROM calls WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 5",
  [customerId]
);
const wallet = await query(
  "SELECT id, transaction_type, type, currency, amount, token_amount, balance_before, balance_after, related_call_id, description, created_at FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10",
  [customerId]
);
const tempCredits = await query(
  "SELECT id, reason, amount, remaining, expires_at, created_at FROM temporary_credits WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 10",
  [customerId]
);
console.log(JSON.stringify({ calls: calls.rows, walletTransactions: wallet.rows, temporaryCredits: tempCredits.rows }, null, 2));
