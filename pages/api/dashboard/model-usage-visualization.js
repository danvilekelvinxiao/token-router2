import { getDashboard, listCustomerCalls } from "@/lib/customer-store";
import { attachImageCallsToDashboard } from "@/lib/image-dashboard-sync";
import { buildEmptyModelUsageVisualization, buildModelUsageVisualization } from "@/lib/model-usage-visualization";
import { requireCustomerSession } from "@/lib/session";
import { getTeamOverviewForUser } from "@/lib/team-token-pool";
import { requireAdmin } from "@/lib/admin-auth";
import { listTeamUsageLogs } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const scope = String(req.query.scope || "workspace");
  const range = String(req.query.range || "7d");
  const requestedTeamId = String(req.query.teamId || "");

  try {
    if (scope === "global") {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const logs = await listTeamUsageLogs({ limit: 5000, includeInternal: true });
      return res.status(200).json(buildModelUsageVisualization({ rows: logs, scope: "global", range }));
    }

    if (scope === "team" || (scope === "workspace" && requestedTeamId)) {
      const teamOverview = await getTeamOverviewForUser(session.customerId, requestedTeamId);
      if (teamOverview?.error) {
        return res.status(403).json({ success: false, error: teamOverview.error, ...buildEmptyModelUsageVisualization({ scope: "team", teamId: requestedTeamId, range }) });
      }
      return res.status(200).json(buildModelUsageVisualization({
        rows: Array.isArray(teamOverview.logs) ? teamOverview.logs : [],
        scope: "team",
        teamId: requestedTeamId || teamOverview?.team?.id || "",
        range,
      }));
    }

    const customer = await getDashboard(session.customerId);
    if (!customer) return res.status(404).json({ error: "用户不存在" });
    const calls = await listCustomerCalls(session.customerId);
    const mergedCustomer = await attachImageCallsToDashboard({ ...customer, calls }, session.customerId);
    return res.status(200).json(buildModelUsageVisualization({
      rows: Array.isArray(mergedCustomer.calls) ? mergedCustomer.calls : [],
      scope: "user",
      teamId: "",
      range,
    }));
  } catch (error) {
    console.error("[api/dashboard/model-usage-visualization]", error);
    return res.status(200).json(buildEmptyModelUsageVisualization({ scope, teamId: requestedTeamId, range }));
  }
}
