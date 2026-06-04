#!/usr/bin/env node

const baseUrl = String(process.env.FLOWAPI_ADMIN_SYNC_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const adminSecret = process.env.FLOWAPI_ADMIN_SECRET || process.env.ADMIN_SECRET || "";

async function main() {
  if (!adminSecret) {
    console.error("缺少 FLOWAPI_ADMIN_SECRET 或 ADMIN_SECRET，无法调用管理员同步检查接口。");
    process.exit(1);
  }

  const response = await fetch(`${baseUrl}/api/admin/sync-consistency/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": adminSecret,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("同步一致性检查失败:", data.error || response.statusText);
    process.exit(1);
  }

  console.log("=== FlowAPI 后台/前台同步一致性检查 ===");
  console.log("检查时间:", data.checkedAt || new Date().toISOString());
  console.log("总状态:", data.ok ? "通过" : "存在不一致");
  console.log("计数:", JSON.stringify(data.counts || {}, null, 2));
  console.log("\n检查项:");
  for (const item of data.checks || []) {
    console.log(`- ${item.name}: ${item.status}${item.message ? ` - ${item.message}` : ""}`);
  }
  if (data.issues?.length) {
    console.log("\n不一致 / 缺失:");
    for (const issue of data.issues) {
      console.log(`- [${issue.level || "warn"}] ${issue.item || ""} ${issue.message}`);
    }
  }

  if (!data.ok) process.exit(2);
}

main().catch((error) => {
  console.error("同步一致性检查异常:", error.message || String(error));
  process.exit(1);
});
