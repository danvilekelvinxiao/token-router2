import { listImageLogs } from "@/lib/image-studio";
import { requireCustomerSession } from "@/lib/session";

function sanitizeName(value = "") {
  return String(value || "image").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

function buildFileName(log, index) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const model = sanitizeName(log?.metadata?.modelUsedId || log?.modelDisplayName || "image-model");
  return `FlowAPI_Image_${day}_${model}_${String(index + 1).padStart(2, "0")}.png`;
}

function sendDataUrl(res, url, fileName) {
  const match = String(url || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return false;
  const mime = match[1] || "image/png";
  const isBase64 = Boolean(match[2]);
  const payload = decodeURIComponent(match[3] || "");
  const buffer = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(payload, "utf8");
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.status(200).send(buffer);
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const requestId = String(req.query.requestId || "");
  const index = Math.max(0, Number(req.query.index || 0));
  if (!requestId) return res.status(400).json({ success: false, error: "缺少 requestId" });

  const result = await listImageLogs({
    viewerId: session.customerId,
    requestId,
    limit: 1,
  });
  const log = result.items?.[0];
  const imageUrl = log?.outputImageUrls?.[index];
  if (!log || !imageUrl) {
    return res.status(404).json({ success: false, error: "图片不存在或无权下载" });
  }

  const fileName = buildFileName(log, index);
  if (sendDataUrl(res, imageUrl, fileName)) return;

  try {
    const upstream = await fetch(imageUrl);
    if (!upstream.ok) throw new Error(`download failed: ${upstream.status}`);
    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/png");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch {
    return res.status(502).json({ success: false, error: "下载失败，请稍后重试。" });
  }
}
