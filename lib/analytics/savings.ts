type Period = "7d" | "30d" | "month" | "all";

type CallSavingInput = {
  inputTokens: number;
  outputTokens: number;
  officialInputPricePerM: number;
  officialOutputPricePerM: number;
  flowapiInputPricePerM: number;
  flowapiOutputPricePerM: number;
};

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMoney(value: number) {
  return Number(toNumber(value).toFixed(8));
}

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_:/.-]+/g, "")
    .trim();
}

function getCallModel(call: any) {
  return call?.routedModel || call?.requestedModel || call?.model || "Unknown Model";
}

function getCallProvider(call: any, modelConfig?: any) {
  return call?.provider || modelConfig?.provider || "FlowAPI";
}

function getCallStatus(call: any) {
  const status = Number(call?.status || 0);
  if (status >= 200 && status < 300) return "success";
  if ([408, 504, 524].includes(status)) return "timeout";
  return "failed";
}

function periodStart(period: Period, now = new Date()) {
  if (period === "all") return null;
  const start = new Date(now);
  if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  const days = period === "7d" ? 7 : 30;
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return start;
}

export function normalizeSavingsPeriod(value: unknown): Period {
  return ["7d", "30d", "month", "all"].includes(String(value))
    ? String(value) as Period
    : "30d";
}

export function calculateCallSaving({
  inputTokens,
  outputTokens,
  officialInputPricePerM,
  officialOutputPricePerM,
  flowapiInputPricePerM,
  flowapiOutputPricePerM,
}: CallSavingInput) {
  const officialCostCny =
    (toNumber(inputTokens) / 1_000_000) * toNumber(officialInputPricePerM) +
    (toNumber(outputTokens) / 1_000_000) * toNumber(officialOutputPricePerM);

  const actualCostCny =
    (toNumber(inputTokens) / 1_000_000) * toNumber(flowapiInputPricePerM) +
    (toNumber(outputTokens) / 1_000_000) * toNumber(flowapiOutputPricePerM);

  const savedAmountCny = officialCostCny - actualCostCny;
  const savedPercent = officialCostCny > 0 ? (savedAmountCny / officialCostCny) * 100 : 0;

  return {
    officialCostCny: roundMoney(officialCostCny),
    actualCostCny: roundMoney(actualCostCny),
    savedAmountCny: roundMoney(savedAmountCny),
    savedPercent: Number(savedPercent.toFixed(1)),
  };
}

export function formatSmallCny(value: unknown): string {
  if (value === null || value === undefined || value === "") return "暂无数据";
  const number = Number(value);
  if (!Number.isFinite(number)) return "暂无数据";
  if (number === 0) return "$0";
  const sign = number < 0 ? "-" : "";
  const abs = Math.abs(number);
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs >= 0.01) return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toFixed(6)}`;
}

export function findModelPriceConfig(call: any, modelConfigs: any[] = []) {
  const callCandidates = [
    call?.requestedModel,
    call?.routedModel,
    call?.model,
    call?.modelId,
  ].map(normalizeText).filter(Boolean);

  return modelConfigs.find((model) => {
    const values = [
      model?.id,
      model?.displayName,
      model?.name,
      model?.modelId,
      model?.publicModelId,
      model?.actualModelId,
    ].map(normalizeText).filter(Boolean);
    return values.some((value) => callCandidates.some((candidate) =>
      value === candidate || value.includes(candidate) || candidate.includes(value)
    ));
  }) || null;
}

function getPriceConfig(model: any) {
  const officialInputPricePerM = toNumber(model?.officialInputPricePerM);
  const officialOutputPricePerM = toNumber(model?.officialOutputPricePerM);
  const flowapiInputPricePerM = toNumber(model?.flowapiInputPricePerM ?? model?.inputPricePerM);
  const flowapiOutputPricePerM = toNumber(model?.flowapiOutputPricePerM ?? model?.outputPricePerM);
  const includeInSavings = model?.includeInSavings !== false;

  if (!includeInSavings || officialInputPricePerM <= 0 || officialOutputPricePerM <= 0) {
    return null;
  }

  return {
    officialInputPricePerM,
    officialOutputPricePerM,
    flowapiInputPricePerM,
    flowapiOutputPricePerM,
  };
}

export function filterCallsByPeriod(calls: any[] = [], period: Period = "30d", now = new Date()) {
  const start = periodStart(period, now);
  if (!start) return calls;
  return calls.filter((call) => {
    const createdAt = call?.createdAt ? new Date(call.createdAt) : null;
    return createdAt && Number.isFinite(createdAt.getTime()) && createdAt >= start;
  });
}

export function calculateCustomerSavings({
  calls = [],
  modelConfigs = [],
  period = "30d",
  now = new Date(),
}: {
  calls?: any[];
  modelConfigs?: any[];
  period?: Period;
  now?: Date;
}) {
  const periodCalls = filterCallsByPeriod(calls, period, now);
  const modelBuckets = new Map<string, any>();
  const callSavings: any[] = [];
  let skippedNoOfficialPrice = 0;

  for (const call of periodCalls) {
    const inputTokens = toNumber(call?.promptTokens ?? call?.inputTokens);
    const outputTokens = toNumber(call?.completionTokens ?? call?.outputTokens);
    const totalTokens = toNumber(call?.tokens, inputTokens + outputTokens);
    if (totalTokens <= 0) continue;

    const modelConfig = findModelPriceConfig(call, modelConfigs);
    const priceConfig = getPriceConfig(modelConfig);
    if (!priceConfig) {
      skippedNoOfficialPrice += 1;
      continue;
    }

    const calculated = calculateCallSaving({
      inputTokens,
      outputTokens,
      ...priceConfig,
    });
    const actualCostFromLog = toNumber(call?.cost, calculated.actualCostCny);
    const officialCostCny = calculated.officialCostCny;
    const savedAmountCny = roundMoney(officialCostCny - actualCostFromLog);
    const savedPercent = officialCostCny > 0 ? Number(((savedAmountCny / officialCostCny) * 100).toFixed(1)) : 0;
    const modelName = modelConfig?.displayName || getCallModel(call);
    const provider = getCallProvider(call, modelConfig);
    const bucketKey = `${provider}:${modelName}`;

    if (!modelBuckets.has(bucketKey)) {
      modelBuckets.set(bucketKey, {
        model: modelName,
        provider,
        ...priceConfig,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        officialCostCny: 0,
        actualCostCny: 0,
        savedAmountCny: 0,
        savedPercent: 0,
      });
    }

    const bucket = modelBuckets.get(bucketKey);
    bucket.requests += 1;
    bucket.inputTokens += inputTokens;
    bucket.outputTokens += outputTokens;
    bucket.totalTokens += totalTokens;
    bucket.officialCostCny = roundMoney(bucket.officialCostCny + officialCostCny);
    bucket.actualCostCny = roundMoney(bucket.actualCostCny + actualCostFromLog);
    bucket.savedAmountCny = roundMoney(bucket.savedAmountCny + savedAmountCny);
    bucket.savedPercent = bucket.officialCostCny > 0 ? Number(((bucket.savedAmountCny / bucket.officialCostCny) * 100).toFixed(1)) : 0;

    callSavings.push({
      id: call?.id || `${call?.createdAt || Date.now()}-${modelName}`,
      createdAt: call?.createdAt || new Date().toISOString(),
      model: modelName,
      modelId: call?.requestedModel || modelConfig?.modelId || "",
      provider,
      inputTokens,
      outputTokens,
      totalTokens,
      ...priceConfig,
      officialCostCny,
      actualCostCny: roundMoney(actualCostFromLog),
      savedAmountCny,
      savedPercent,
      requestIp: call?.requestIp || call?.ip || "",
      status: getCallStatus(call),
      deductionBreakdown: Array.isArray(call?.deductionBreakdown) ? call.deductionBreakdown : [],
      deductionSource: call?.deductionSource || "",
    });
  }

  const modelSavings = Array.from(modelBuckets.values())
    .map((item) => ({
      ...item,
      inputTokens: Math.round(item.inputTokens),
      outputTokens: Math.round(item.outputTokens),
      totalTokens: Math.round(item.totalTokens),
    }))
    .sort((a, b) => b.savedAmountCny - a.savedAmountCny);

  const officialCostCny = roundMoney(modelSavings.reduce((sum, item) => sum + item.officialCostCny, 0));
  const actualCostCny = roundMoney(modelSavings.reduce((sum, item) => sum + item.actualCostCny, 0));
  const savedAmountCny = roundMoney(officialCostCny - actualCostCny);
  const totalTokens = modelSavings.reduce((sum, item) => sum + item.totalTokens, 0);
  const totalRequests = modelSavings.reduce((sum, item) => sum + item.requests, 0);
  const savedPercent = officialCostCny > 0 ? Number(((savedAmountCny / officialCostCny) * 100).toFixed(1)) : 0;

  return {
    period,
    hasRealCalls: periodCalls.length > 0,
    hasSavingsData: modelSavings.length > 0,
    skippedNoOfficialPrice,
    summary: modelSavings.length ? {
      officialCostCny,
      actualCostCny,
      savedAmountCny,
      savedPercent,
      totalTokens,
      totalRequests,
    } : null,
    modelSavings,
    callSavings: callSavings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  };
}

export function buildSavingsRank(currentCustomerId: string, customerSavings: Array<{ customerId: string; savedAmountCny: number }>) {
  const ranked = customerSavings
    .filter((item) => toNumber(item.savedAmountCny) > 0)
    .sort((a, b) => b.savedAmountCny - a.savedAmountCny);

  if (ranked.length < 2) return null;

  const index = ranked.findIndex((item) => item.customerId === currentCustomerId);
  if (index < 0) return null;

  const rank = index + 1;
  const percentileTop = Math.max(1, Math.ceil((rank / ranked.length) * 100));
  const beatsUsersPercent = Math.max(0, Math.round(((ranked.length - rank) / ranked.length) * 100));

  return {
    savedAmountCny: roundMoney(ranked[index].savedAmountCny),
    percentileTop,
    beatsUsersPercent,
    rankUpdatedAt: new Date().toISOString(),
  };
}
