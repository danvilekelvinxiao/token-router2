import { requireCustomerSession } from "@/lib/session";
import { getTeamBillingForUser, roleCan } from "@/lib/team-management";

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows = []) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export default async function handler(req, res) {
  const session = requireCustomerSession(req, res);
  if (!session) return;
  const data = await getTeamBillingForUser(session.customerId, String(req.query.teamId || ""));
  if (data.error) return res.status(403).json({ error: data.error });
  if (!roleCan(data.role, "export_billing")) return res.status(403).json({ error: "只有队长或财务可以导出团队账单" });

  const rows = [
    ["FlowAPI 团队账单"],
    ["团队", data.team?.name || ""],
    ["导出时间", new Date().toISOString()],
    [],
    ["总览", "请求数", "总 Token", "总花费（$ API）", "节省金额（$ API）", "成功率", "团队余额（$ API）"],
    ["", data.summary?.requestCount || 0, data.summary?.totalTokens || 0, data.summary?.totalCostCny || 0, data.summary?.savedCny || 0, `${data.summary?.successRate || 0}%`, data.summary?.walletBalanceCny || 0],
    [],
    ["成员消耗"],
    ["成员", "角色", "今日请求", "今日 Token", "今日花费（$ API）", "本月 Token", "本月花费（$ API）", "累计花费（$ API）", "成功率", "限制"],
    ...(data.members || []).map((member) => [
      member.memberName,
      member.roleLabel,
      member.usage?.todayRequests || 0,
      member.usage?.todayTokens || 0,
      member.usage?.todayCostCny || 0,
      member.usage?.monthTokens || 0,
      member.usage?.monthCostCny || 0,
      member.usage?.totalCostCny || 0,
      `${member.usage?.successRate || 0}%`,
      member.limit?.enabled ? `${member.limit.limitType}/${member.limit.limitUnit}/${member.limit.limitAmount}` : "无限制",
    ]),
    [],
    ["模型消耗"],
    ["模型", "请求数", "Token", "花费"],
    ...(data.modelCosts || []).map((item) => [item.model, item.requests, item.tokens, item.costCny]),
    [],
    ["API Key 消耗"],
    ["API Key", "请求数", "Token", "花费"],
    ...(data.apiKeyCosts || []).map((item) => [item.apiKeyId, item.requests, item.tokens, item.costCny]),
    [],
    ["失败请求"],
    ["时间", "成员ID", "API Key", "模型", "错误码", "错误信息", "Request ID"],
    ...(data.logs || []).filter((log) => log.success === false).map((log) => [log.createdAt, log.userId, log.apiKeyId, log.model, log.errorCode, log.errorMessage, log.requestId]),
  ];

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="flowapi-team-billing-${data.team?.id || "team"}.csv"`);
  return res.status(200).send(`\uFEFF${rowsToCsv(rows)}`);
}
