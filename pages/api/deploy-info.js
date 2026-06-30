import { getDeployInfo } from "@/lib/deploy-info";

export default function handler(req, res) {
  if (req.method === "HEAD") return res.status(200).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  return res.status(200).json({
    ok: true,
    service: "flowapi",
    deploy: getDeployInfo(),
  });
}
