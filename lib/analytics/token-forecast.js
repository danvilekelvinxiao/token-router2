function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  const safe = values.filter((value) => Number.isFinite(value));
  if (!safe.length) return 0;
  return safe.reduce((sum, value) => sum + value, 0) / safe.length;
}

export function generateTokenForecast(recentUsage = [], days = 7) {
  const recent = recentUsage
    .map((item) => Number(item?.tokens ?? item?.totalTokens ?? item?.value ?? 0))
    .filter((value) => Number.isFinite(value));

  if (!recent.length) {
    return Array.from({ length: days }, () => 0);
  }

  const weights = recent.map((_, index) => index + 1);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const weightedAvg = recent.reduce((sum, value, index) => sum + value * weights[index], 0) / weightTotal;

  const first3DaysAvg = average(recent.slice(0, Math.min(3, recent.length)));
  const last3DaysAvg = average(recent.slice(Math.max(0, recent.length - 3)));
  const growthRate = first3DaysAvg > 0 ? (last3DaysAvg - first3DaysAvg) / first3DaysAvg : 0;
  const clampedGrowthRate = clamp(growthRate, -0.3, 0.5);

  return Array.from({ length: days }, (_, index) => {
    const n = index + 1;
    return Math.max(0, Math.round(weightedAvg * (1 + clampedGrowthRate * n * 0.35)));
  });
}
