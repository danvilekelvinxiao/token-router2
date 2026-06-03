import { buildImageEndpointPayload, runImageStudioJob } from "@/lib/image-studio";
import { requireCustomerSession } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const payload = buildImageEndpointPayload(req.body || {});
  const result = await runImageStudioJob({
    req,
    customerId: session.customerId,
    prompt: payload.prompt,
    images: payload.images,
    modelId: payload.modelId,
    aspectRatio: payload.aspectRatio,
    quality: payload.quality,
    n: payload.n,
    saveHistory: payload.saveHistory,
    autoRetry: payload.autoRetry,
    returnFormat: payload.returnFormat,
    endpoint: "/api/image-chat",
  });

  return res.status(result.status || (result.ok ? 200 : 500)).json(result);
}
