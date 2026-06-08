import { getDashboard } from "@/lib/customer-store";
import { buildLocalDemoDashboard, isLocalDemoRequest } from "@/lib/local-demo-dashboard";
import { assertCustomerOwner } from "@/lib/session";
import { attachImageCallsToDashboard } from "@/lib/image-dashboard-sync";

export default async function handler(req, res) {
  if (req.method === "POST") {
    return res.status(410).json({
      error: "该登录入口已停用，请使用 /api/auth/login。",
      suggestion: "为了保护账号安全，FlowAPI 现在统一使用邮箱登录和验证码注册流程。",
    });
  }

  if (req.method === "GET") {
    const session = assertCustomerOwner(req, res, req.query.customerId);
    if (!session) return;
    const customer = await getDashboard(session.customerId);
    if (!customer) return res.status(404).json({ error: "用户不存在或服务实例已重启" });
    if (isLocalDemoRequest(req)) return res.status(200).json(buildLocalDemoDashboard(customer));
    return res.status(200).json(await attachImageCallsToDashboard(customer, session.customerId));
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
