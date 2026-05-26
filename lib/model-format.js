function compactNumber(value, unit) {
  const scaled = value / unit.value;
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const text = scaled
    .toFixed(digits)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");

  return `${text}${unit.suffix}`;
}

export function formatTokens(value) {
  if (value === null || value === undefined || value === "") {
    return "同步中";
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "同步中";
  }

  if (numeric === 0) {
    return "暂无数据";
  }

  const units = [
    { value: 1_000_000_000_000, suffix: "T" },
    { value: 1_000_000_000, suffix: "B" },
    { value: 1_000_000, suffix: "M" },
    { value: 1_000, suffix: "K" },
  ];

  const abs = Math.abs(numeric);
  const matched = units.find((unit) => abs >= unit.value);

  if (!matched) {
    return `${Math.round(numeric)}`;
  }

  const compact = compactNumber(abs, matched);
  return numeric < 0 ? `-${compact}` : compact;
}

export function formatChangeTrend(changePercent, isNew = false) {
  if (isNew) {
    return { label: "new", tone: "new" };
  }

  if (changePercent === null || changePercent === undefined || changePercent === "") {
    return null;
  }

  const numeric = Number(changePercent);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric === 0) {
    return { label: "→0%", tone: "neutral" };
  }

  return {
    label: `${numeric > 0 ? "↑" : "↓"}${Math.abs(numeric)}%`,
    tone: numeric > 0 ? "up" : "down",
  };
}

export function formatCny(value, digits = 2) {
  if (value === null || value === undefined || value === "") {
    return "暂无数据";
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "暂无数据";
  }

  return `¥${numeric.toFixed(digits)}`;
}
