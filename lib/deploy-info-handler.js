import { getDeployInfo, getPublicDeployInfo } from "@/lib/deploy-info";

export function handleDeployInfo(req, res) {
  if (req.method === "HEAD") return res.status(200).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const debugToken = process.env.FLOWAPI_DEPLOY_INFO_TOKEN;
  const suppliedToken = req.headers["x-flowapi-deploy-token"] || req.query?.token;
  const canShowPrivateInfo = Boolean(debugToken && suppliedToken === debugToken);

  return res.status(200).json({
    ok: true,
    service: "flowapi",
    deploy: canShowPrivateInfo ? getDeployInfo() : getPublicDeployInfo(),
  });
}
