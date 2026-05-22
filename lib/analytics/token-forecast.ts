export interface DailyTokenUsage {
  date: string; // YYYY-MM-DD
  tokens: number;
}

export interface ForecastPoint {
  date: string;
  actual: number | null;
  predicted: number | null;
  isFuture: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Generate a 14-day token forecast based on the last 7 days of real usage.
 * Days 1-7 show actual data; days 8-14 show prediction (blue line).
 * Falls back to empty forecasts if no data is available.
 */
export function generateTokenForecast(
  recentUsage: DailyTokenUsage[],
): ForecastPoint[] {
  const days = 7;
  const recent = recentUsage.slice(-days);
  const now = new Date();
  const points: ForecastPoint[] = [];

  // Fill actual data for the last 7 days (pad missing with null)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const found = recent.find((r) => r.date === dateStr);
    points.push({ date: dateStr, actual: found ? found.tokens : null, predicted: null, isFuture: false });
  }

  const validDays = points.filter((p) => p.actual != null);
  if (validDays.length < 2) {
    // Not enough data — fill with 0 prediction
    for (let i = 1; i <= days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      points.push({ date: d.toISOString().slice(0, 10), actual: null, predicted: 0, isFuture: true });
    }
    return points;
  }

  // Weighted moving average (recent days weight more)
  const values = validDays.map((p) => p.actual!);
  const weights = Array.from({ length: values.length }, (_, i) => i + 1);
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const weightedAvg = values.reduce((s, v, i) => s + v * weights[i], 0) / weightSum;

  // Growth rate: compare first 3 vs last 3
  const halfN = Math.min(3, Math.floor(values.length / 2));
  const firstAvg = values.slice(0, halfN).reduce((s, v) => s + v, 0) / halfN || 1;
  const lastAvg = values.slice(-halfN).reduce((s, v) => s + v, 0) / halfN || 1;
  const growthRate = clamp((lastAvg - firstAvg) / Math.max(firstAvg, 1), -0.3, 0.5);

  // Generate future prediction
  for (let i = 1; i <= days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const factor = 1 + growthRate * i * 0.35;
    const predicted = Math.round(weightedAvg * factor);
    points.push({ date: d.toISOString().slice(0, 10), actual: null, predicted, isFuture: true });
  }

  return points;
}

/**
 * Mock 7-day usage for development / fallback.
 */
export function generateMockUsage(days = 7): DailyTokenUsage[] {
  const now = new Date();
  const result: DailyTokenUsage[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    result.push({
      date: d.toISOString().slice(0, 10),
      tokens: Math.floor(Math.random() * 120000) + 30000,
    });
  }
  return result;
}
