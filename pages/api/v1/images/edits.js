import { runImageStudioJobByToken } from "@/lib/image-studio";

function getClientToken(req) {
  const auth = req.headers.authorization || "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : String(req.headers["x-api-key"] || "").trim();
  while (token.toLowerCase().startsWith("bearer ")) token = token.slice(7).trim();
  return token.replace(/^["']|["']$/g, "");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getClientToken(req);
  if (!token) {
    return res.status(401).json({ error: "缺少 FlowAPI API Key" });
  }

  const result = await runImageStudioJobByToken({
    req,
    token,
    body: req.body || {},
    endpoint: "/v1/images/edits",
  });

  return res.status(result.status || (result.ok ? 200 : 500)).json(result);
}
