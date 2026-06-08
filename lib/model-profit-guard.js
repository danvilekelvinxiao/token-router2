function moneyNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function minProfitMargin() {
  const configured = Number(process.env.FLOWAPI_MIN_TEXT_PROFIT_MARGIN ?? 0.2);
  return Number.isFinite(configured) ? Math.max(0, configured) : 0.2;
}

export function getTextModelPricingSnapshot(modelProduct = {}, multiplier = 1) {
  const pricing = modelProduct?.pricing || {};
  const billingMode = pricing.billingMode || "token_multiplier";
  const priceMultiplier = Math.max(0, moneyNumber(multiplier || 1));
  const inputCostPerMTokens = moneyNumber(pricing.inputCostPerMTokens);
  const outputCostPerMTokens = moneyNumber(pricing.outputCostPerMTokens);
  const inputSellPricePerMTokens = moneyNumber(
    pricing.inputSellPricePerMTokens ?? pricing.inputPricePerM ?? pricing.flowapiInputPricePerM
  ) * priceMultiplier;
  const outputSellPricePerMTokens = moneyNumber(
    pricing.outputSellPricePerMTokens ?? pricing.outputPricePerM ?? pricing.flowapiOutputPricePerM
  ) * priceMultiplier;
  const totalCostPerMTokens = inputCostPerMTokens + outputCostPerMTokens;
  const totalSellPricePerMTokens = inputSellPricePerMTokens + outputSellPricePerMTokens;
  const profitPerMTokens = totalSellPricePerMTokens - totalCostPerMTokens;

  return {
    billingMode,
    inputCostPerMTokens,
    outputCostPerMTokens,
    inputSellPricePerMTokens,
    outputSellPricePerMTokens,
    totalCostPerMTokens,
    totalSellPricePerMTokens,
    profitPerMTokens,
    profitMargin: totalSellPricePerMTokens > 0 ? profitPerMTokens / totalSellPricePerMTokens : 0,
  };
}

export function validateTextModelProfitConfig(modelProduct = {}, { multiplier = 1 } = {}) {
  if (process.env.FLOWAPI_ALLOW_UNCOSTED_MODELS === "true") {
    return { ok: true, code: "UNCOSTED_MODELS_ALLOWED", message: "" };
  }

  const snapshot = getTextModelPricingSnapshot(modelProduct, multiplier);
  const minMargin = minProfitMargin();
  const requiredRatio = 1 + minMargin;

  if (!modelProduct?.pricing || snapshot.totalCostPerMTokens <= 0) {
    return {
      ok: false,
      code: "MODEL_COST_MISSING",
      message: "该模型尚未配置上游成本价，暂不能创建 API Key 或发起调用。",
      userMessage: "该模型价格尚未通过毛利审核，请先选择其他模型或联系客服开通。",
      snapshot,
    };
  }

  if (snapshot.inputCostPerMTokens <= 0 || snapshot.outputCostPerMTokens <= 0) {
    return {
      ok: false,
      code: "MODEL_COST_INCOMPLETE",
      message: "该模型输入或输出成本价不完整，暂不能创建 API Key 或发起调用。",
      userMessage: "该模型价格尚未通过毛利审核，请先选择其他模型或联系客服开通。",
      snapshot,
    };
  }

  if (snapshot.inputSellPricePerMTokens <= 0 || snapshot.outputSellPricePerMTokens <= 0) {
    return {
      ok: false,
      code: "MODEL_SELL_PRICE_MISSING",
      message: "该模型售价不完整，暂不能创建 API Key 或发起调用。",
      userMessage: "该模型售价尚未配置完成，请先选择其他模型或联系客服开通。",
      snapshot,
    };
  }

  if (
    snapshot.inputSellPricePerMTokens < snapshot.inputCostPerMTokens * requiredRatio ||
    snapshot.outputSellPricePerMTokens < snapshot.outputCostPerMTokens * requiredRatio
  ) {
    return {
      ok: false,
      code: "MODEL_MARGIN_TOO_LOW",
      message: `该模型售价低于最低毛利保护线 ${Math.round(minMargin * 100)}%。`,
      userMessage: "该模型当前维护中，请先切换其他模型。",
      snapshot,
    };
  }

  return {
    ok: true,
    code: "MODEL_MARGIN_OK",
    message: "",
    snapshot,
  };
}
