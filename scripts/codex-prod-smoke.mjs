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

const { registerCustomer, verifyCustomerEmail, createApiKey, getCustomer } = await import("../lib/customer-store.js");
const { listModelProductsWithConfig } = await import("../lib/model-products-server.js");

const email = `codex-prod-${Date.now()}@flowapi.fun`;
const password = "FlowapiSmoke123!";
const reg = await registerCustomer({ email, password });
if (reg.error) throw new Error(reg.error);
const verified = await verifyCustomerEmail(email);
if (!verified?.id) throw new Error("verify failed");
const models = await listModelProductsWithConfig({ includeUnavailable: false });
const model = models.find((m) => m.publicModelId === "gpt-5.5") || models.find((m) => m.publicModelId === "gpt-4o-mini") || models.find((m) => m.publicModelId === "deepseek-chat") || models[0];
if (!model) throw new Error("no model");
const key = await createApiKey(verified.id, "Codex Smoke Key", null, model, { usagePurpose: "smoke-test" });
const customer = await getCustomer(verified.id);
console.log(JSON.stringify({ email, customerId: verified.id, balance: customer.balance, model: { id: model.id, publicModelId: model.publicModelId, displayName: model.displayName, actualModelId: model.actualModelId }, apiKey: key.token }, null, 2));
