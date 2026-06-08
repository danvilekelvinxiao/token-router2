import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  return res.status(404).json({
    error: "FlowAPI 管理接口不存在",
    suggestion: "New API 管理能力已收口到明确的后台接口，禁止通过 /api/admin/* 泛代理访问上游管理面。",
  });
}
