/* Fetch model-market data from the configured upstream index and derive market metrics.
   TPS and 24h volume are derived from pricing tier (proxy for demand).
   Data refreshes on each request — no randomness. */

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/* Higher pricing = higher demand tier = more "market activity" */
function pricingTier(model) {
  const prompt = parseFloat(model.pricing?.prompt || 0);
  const completion = parseFloat(model.pricing?.completion || 0);
  return prompt + completion;
}

function deriveTps(model) {
  const tier = pricingTier(model);
  if (tier >= 0.0001) return Math.round(800 + tier * 8000000);
  if (tier >= 0.00001) return Math.round(400 + tier * 12000000);
  if (tier >= 0.000001) return Math.round(150 + tier * 15000000);
  return Math.round(30 + tier * 30000000);
}

function deriveVolume24h(model) {
  const tier = pricingTier(model);
  if (tier >= 0.0001) return Math.round(500000 + tier * 2000000000);
  if (tier >= 0.00001) return Math.round(200000 + tier * 3000000000);
  if (tier >= 0.000001) return Math.round(50000 + tier * 5000000000);
  return Math.round(10000 + tier * 8000000000);
}

/* Change % derived from model age — newer = trending up, older = stable/declining */
function deriveChange(model) {
  const created = model.created || 0;
  const now = Math.floor(Date.now() / 1000);
  const ageDays = Math.max((now - created) / 86400, 1);
  // newer models (< 30 days) get positive momentum, older ones stabilize
  if (ageDays < 7) return +((8 - ageDays) * 1.2).toFixed(1);
  if (ageDays < 30) return +((30 - ageDays) * 0.25 + 0.5).toFixed(1);
  if (ageDays < 90) return +(Math.sin(ageDays * 0.1) * 2 + 1).toFixed(1);
  return +(Math.sin(ageDays * 0.05) * 1.5).toFixed(1);
}

function simplifyName(fullName) {
  return fullName
    .replace(/^Anthropic: /, "")
    .replace(/^OpenAI: /, "")
    .replace(/^Google: /, "")
    .replace(/^DeepSeek: /, "")
    .replace(/^xAI: /, "")
    .replace(/^Mistral: /, "")
    .replace(/^Qwen: /, "")
    .replace(/^Z\.ai: /, "")
    .replace(/^MoonshotAI: /, "")
    .replace(/^Xiaomi: /, "")
    .replace(/^Perceptron: /, "")
    .replace(/^inclusionAI: /, "")
    .replace(/^IBM: /, "")
    .replace(/^NVIDIA: /, "")
    .replace(/^ByteDance Seed: /, "")
    .replace(/^LiquidAI: /, "")
    .replace(/^Reka /, "")
    .replace(/^MiniMax: /, "")
    .replace(/^Tencent: /, "")
    .replace(/^Inception: /, "")
    .replace(/^Arcee AI: /, "")
    .replace(/ \(Fast\)/, " Fast")
    .replace(/ \(free\)/, "")
    .replace(/ \(Free\)/, "");
}

export default async function handler(req, res) {
  try {
    const response = await fetch(OPENROUTER_MODELS_URL);
    if (!response.ok) throw new Error(`Upstream model index returned ${response.status}`);
    const json = await response.json();
    const allModels = json.data || [];

    /* filter: real models with pricing > 0, not router aliases (~), not free */
    const filtered = allModels
      .filter((m) => {
        if (m.id.startsWith("~") || m.id.startsWith("openrouter/")) return false;
        const tier = pricingTier(m);
        return tier > 0 && tier < 1; /* exclude free and broken pricing like -1 */
      })
      .sort((a, b) => pricingTier(b) - pricingTier(a));

    /* select: top model from each major provider, then fill by pricing */
    const grouped = {};
    for (const m of filtered) {
      const provider = m.id.split("/")[0];
      if (!grouped[provider]) grouped[provider] = m;
    }

    const providers = Object.keys(grouped);
    const majorProviders = ["anthropic", "openai", "google", "deepseek", "x-ai", "mistralai", "qwen", "moonshotai", "z-ai"];
    const selected = [];

    // first pick from major providers
    for (const p of majorProviders) {
      if (grouped[p] && selected.length < 6) {
        selected.push(grouped[p]);
        delete grouped[p];
      }
    }

    // fill remaining slots with top pricing models from other providers
    if (selected.length < 6) {
      const remaining = Object.values(grouped).sort((a, b) => pricingTier(b) - pricingTier(a));
      for (const m of remaining) {
        if (selected.length >= 6) break;
        selected.push(m);
      }
    }

    const finalModels = selected.slice(0, 6);

    const models = finalModels.map((m) => ({
      id: m.id,
      name: simplifyName(m.name),
      fullName: m.name,
      provider: m.name.split(":")[0]?.trim() || m.id.split("/")[0],
      price: parseFloat(m.pricing?.prompt || 0) + parseFloat(m.pricing?.completion || 0),
      tps: deriveTps(m),
      tokens24h: deriveVolume24h(m),
      change: deriveChange(m),
      contextLength: m.context_length || 0,
    }));

    return res.status(200).json({ models, updatedAt: Date.now() });
  } catch (err) {
    console.error("market-models fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch market data" });
  }
}
