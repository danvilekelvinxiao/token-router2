import { requireAdmin } from "@/lib/admin-auth";
import { listTeamDailyReports } from "@/lib/team-token-pool";

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  const reports = await listTeamDailyReports({ date, teamId: String(req.query.teamId || "") });
  const rows = [
    ["日期", "团队", "调用次数", "成功次数", "失败次数", "成功率", "总 Token", "实际成本", "节省金额", "缓存命中", "限流次数", "异常次数", "建议"],
    ...reports.map((item) => [
      item.reportDate,
      item.teamName,
      item.calls,
      item.successCount,
      item.failedCount,
      `${Math.round(Number(item.successRate || 0) * 100)}%`,
      item.totalTokens,
      item.actualCostCny,
      item.savedCny,
      item.cacheHits,
      item.rateLimitedCount,
      item.errorCount,
      item.recommendation,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="flowapi-team-report-${date}.csv"`);
  return res.status(200).send(`\uFEFF${csv}`);
}
