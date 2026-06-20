import fs from "fs";
import path from "path";
import { requireAdmin } from "@/lib/admin-auth";
import { hasDatabase } from "@/lib/db";
import { validateRedeemCodePayload } from "@/lib/redeem-codes";

function fileExists(relativePath) {
  return fs.existsSync(path.join(/* turbopackIgnore: true */ process.cwd(), relativePath));
}

function checkActivationPayloads() {
  const cases = [
    validateRedeemCodePayload({ type: "balance", amountCny: 10 }),
    validateRedeemCodePayload({ type: "token", tokenAmount: 100000 }),
    validateRedeemCodePayload({ type: "package", packageId: "weekly_plan" }),
  ];
  return cases.every((item) => item.ok);
}

function item(name, status, message = "") {
  return { name, status, message };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const checks = [
    item("管理员鉴权", "normal", `当前管理员：${admin.customer?.email || admin.customer?.id || "admin"}`),
    item("激活码创建接口", checkActivationPayloads() && fileExists("pages/api/admin/activation-codes.js") ? "normal" : "abnormal", "支持金额额度、Token 额度、套餐服务三类 dry-run 校验。"),
    item("激活码兑换接口", fileExists("pages/api/redeem.js") ? "normal" : "abnormal", "用户兑换入口存在。"),
    item("用户删除接口", fileExists("pages/api/admin/users.js") ? "normal" : "abnormal", "支持 deleteCustomer 软删除动作。"),
    item("API Key 创建接口", fileExists("pages/api/api-keys.js") || fileExists("pages/api/admin/api-keys/import-newapi-token.js") ? "normal" : "待确认", "检查 API Key 创建/导入入口。"),
    item("用户充值接口", fileExists("pages/api/recharge-orders.js") || fileExists("pages/api/admin/recharges.js") ? "normal" : "待确认", "检查充值订单与审核入口。"),
    item("支付订单查询", fileExists("pages/api/admin/recharges.js") ? "normal" : "待确认", "充值审核 API 存在。"),
    item("模型上架接口", fileExists("pages/api/admin/models/publish.js") ? "normal" : "待确认", "模型发布入口存在。"),
    item("模型价格保存", fileExists("pages/api/admin/model-pricing/index.js") ? "normal" : "待确认", "模型价格配置 API 存在。"),
    item("公告发布", fileExists("pages/api/admin/content/[type].js") ? "normal" : "待确认", "CMS 内容保存接口存在。"),
    item("使用日志导出", fileExists("pages/api/usage-logs/export.js") ? "normal" : "待确认", "使用日志导出入口存在。"),
    item("图片下载", fileExists("pages/api/images/download.js") ? "normal" : "待确认", "图片下载接口存在，仍需真实图片 E2E 验证。"),
    item("QR 图片资源", fileExists("public/images/qrcode") ? "normal" : "待确认", "二维码目录存在。"),
    item("数据面板真实数据接口", fileExists("pages/api/analytics/dashboard-v2.js") || fileExists("pages/api/dashboard/overview.js") ? "normal" : "待确认", "数据面板 API 存在。"),
    item(
      "New API 连接",
      process.env.NEW_API_BASE_URL || process.env.NEW_API_ADMIN_TOKEN || process.env.NEW_API_KEY || process.env.NEW_API_KEY_ALL_MODELS || process.env.SUB2API_API_KEY ? "normal" : "未配置",
      "检查 New API / sub2api 环境变量。"
    ),
    item("数据库连接", hasDatabase() ? "normal" : "未配置", hasDatabase() ? "已检测到数据库配置。" : "当前可能运行在内存模式。"),
  ];

  const summary = {
    normal: checks.filter((check) => check.status === "normal").length,
    abnormal: checks.filter((check) => check.status === "abnormal").length,
    unconfigured: checks.filter((check) => check.status === "未配置").length,
    pending: checks.filter((check) => check.status === "待确认").length,
  };

  return res.status(200).json({
    success: true,
    updatedAt: new Date().toISOString(),
    summary,
    checks,
  });
}
