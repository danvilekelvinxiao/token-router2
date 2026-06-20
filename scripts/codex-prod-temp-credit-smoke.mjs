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

const { registerCustomer, verifyCustomerEmail, createApiKey, grantTemporaryCredit, finalizeReservedCallByToken } = await import("../lib/customer-store.js");
const { listModelProductsWithConfig } = await import("../lib/model-products-server.js");
const { query } = await import("../lib/db.js");
const email = `codex-temp-credit-${Date.now()}@flowapi.fun`;
const password = "FlowapiSmoke123!";
const reg = await registerCustomer({ email, password });
if (reg.error) throw new Error(reg.error);
const verified = await verifyCustomerEmail(email);
if (!verified?.id) throw new Error("verify failed");

await query("UPDATE customers SET balance = 10 WHERE id = $1", [verified.id]);
await query("DELETE FROM temporary_credits WHERE customer_id = $1", [verified.id]);
await query("DELETE FROM wallet_transactions WHERE user_id = $1", [verified.id]);
await query("DELETE FROM calls WHERE customer_id = $1", [verified.id]);

const tempGrant = await grantTemporaryCredit(verified.id, {
  amount: 0.1,
  reason: "codex_smoke_temp_credit",
  detail: "Codex smoke temp credit",
});

const models = await listModelProductsWithConfig({ includeUnavailable: false });
const model = models.find((item) => item.publicModelId === "gpt-5.5") || models.find((item) => item.publicModelId === "gpt-4o-mini") || models.find((item) => item.publicModelId === "deepseek-chat") || models[0];
if (!model) throw new Error("no available model");
const key = await createApiKey(verified.id, "Temp Credit Smoke Key", null, model, { usagePurpose: "smoke-test" });
const customer = await query("SELECT balance FROM customers WHERE id = $1 LIMIT 1", [verified.id]);

const requestId = `manual-finalize-${Date.now()}`;
const before = await query("SELECT COUNT(*)::int AS c FROM wallet_transactions WHERE user_id = $1", [verified.id]);
const finalizeResult = await finalizeReservedCallByToken(key.token, {
  requestId,
  cost: 0.08,
  tokens: 7,
  promptTokens: 6,
  completionTokens: 1,
  status: 200,
  requestedModel: model.publicModelId,
  publicModelId: model.publicModelId,
  actualModelId: model.actualModelId,
  routedModel: model.displayName,
  routeStrategy: "router",
  billingMode: "token_multiplier",
  isStream: false,
  grantUsageCredit: false,
}, 0);
const after = await query("SELECT COUNT(*)::int AS c FROM wallet_transactions WHERE user_id = $1", [verified.id]);
const walletRows = await query(
  "SELECT transaction_type, type, currency, amount, token_amount, money_amount, related_call_id, description FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5",
  [verified.id]
);
const tempCredits = await query(
  "SELECT reason, amount, remaining FROM temporary_credits WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 5",
  [verified.id]
);

console.log(JSON.stringify({
  email,
  customerId: verified.id,
  balance: customer.rows[0]?.balance,
  tempGrant,
  model,
  apiKey: key.token,
  before: before.rows[0]?.c,
  after: after.rows[0]?.c,
  finalizeResult,
  walletRows: walletRows.rows,
  tempCredits: tempCredits.rows,
}, null, 2));
