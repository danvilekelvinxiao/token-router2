import { hasDatabase, pingDatabase } from "@/lib/db";
import { checkUpstreamHealth } from "@/lib/upstream";
import { getDeployInfo } from "@/lib/deploy-info";

async function checkDatabaseHealth() {
  if (!hasDatabase()) {
    return { ok: false, status: "missing", message: "DATABASE_URL 未配置" };
  }

  try {
    await pingDatabase();
    return { ok: true, status: "ok", message: "数据库可连接" };
  } catch (error) {
    return { ok: false, status: "degraded", message: error.message || "数据库连接失败" };
  }
}

function publicHealthPayload({ database = {}, upstream = {} } = {}) {
  const ok = Boolean(database.ok && upstream.ok);
  return {
    ok,
    service: "flowapi",
    database: database.status || "degraded",
    upstream: upstream.status || "degraded",
    modelService: ok ? "ok" : "degraded",
    serviceStatus: ok ? "ok" : "degraded",
    message: ok ? "FlowAPI 服务可用" : "FlowAPI 服务暂时不可用",
    suggestion: ok
      ? "数据库与至少一个上游通道正常，正式调用可继续使用。"
      : "请稍后重试；如果持续失败，请联系 FlowAPI 客服并提供 Request ID。",
    deploy: {
      shortCommit: getDeployInfo().shortCommit,
      buildId: getDeployInfo().buildId,
    },
    time: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (req.method === "HEAD") {
    const [database, upstream] = await Promise.all([
      checkDatabaseHealth(),
      checkUpstreamHealth({ timeoutMs: 4000 }),
    ]);
    return res.status(database.ok && upstream.ok ? 200 : 500).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const [database, upstream] = await Promise.all([
    checkDatabaseHealth(),
    checkUpstreamHealth({ timeoutMs: 5000 }),
  ]);
  return res.status(database.ok && upstream.ok ? 200 : 500).json(publicHealthPayload({ database, upstream }));
}
