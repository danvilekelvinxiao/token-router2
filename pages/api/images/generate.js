import { buildImageEndpointPayload, runImageStudioJob } from "@/lib/image-studio";
import { requireCustomerSession } from "@/lib/session";

export const config = {
  api: {
    bodyParser: false,
  },
};

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const UNSUPPORTED_REFERENCE_TYPES = new Set(["video/mp4", "video/webm", "application/pdf", "text/plain"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function parseImagesField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [String(value)];
  } catch {
    return [String(value)];
  }
}

async function readRequestBuffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseMultipartBuffer(buffer, boundary) {
  const fields = {};
  const files = [];
  const body = buffer.toString("binary");
  const parts = body.split(`--${boundary}`);

  for (const part of parts) {
    if (!part || part === "--\r\n" || part === "--") continue;
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headerText = part.slice(0, headerEnd);
    let payload = part.slice(headerEnd + 4);
    if (payload.endsWith("\r\n")) payload = payload.slice(0, -2);
    if (payload.endsWith("--")) payload = payload.slice(0, -2);

    const nameMatch = headerText.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const filenameMatch = headerText.match(/filename="([^"]*)"/);
    const typeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
    const name = nameMatch[1];
    const contentType = String(typeMatch?.[1] || "application/octet-stream").trim();

    if (filenameMatch) {
      files.push({
        name,
        filename: filenameMatch[1],
        contentType,
        data: Buffer.from(payload, "binary"),
      });
    } else {
      fields[name] = Buffer.from(payload, "binary").toString("utf8");
    }
  }

  return { fields, files };
}

async function parseRequest(req) {
  const contentType = String(req.headers["content-type"] || "");
  if (contentType.includes("application/json")) {
    const buffer = await readRequestBuffer(req);
    return {
      fields: JSON.parse(buffer.toString("utf8") || "{}"),
      files: [],
    };
  }

  const boundary = contentType.match(/boundary=([^;]+)/)?.[1];
  if (!boundary) return { fields: {}, files: [] };
  const buffer = await readRequestBuffer(req);
  return parseMultipartBuffer(buffer, boundary);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const { fields, files } = await parseRequest(req);
  const unsupportedFile = files.find((file) => UNSUPPORTED_REFERENCE_TYPES.has(file.contentType));
  if (unsupportedFile) {
    return res.status(400).json({
      success: false,
      ok: false,
      code: "UNSUPPORTED_ATTACHMENT",
      message: "当前图片模型暂不支持视频 / 文件作为生成输入，请先删除或换成图片参考。",
      error: "当前图片模型暂不支持视频 / 文件作为生成输入，请先删除或换成图片参考。",
    });
  }

  const images = files
    .filter((file) => IMAGE_MIME_TYPES.has(file.contentType))
    .map((file) => {
      if (file.data.length > MAX_IMAGE_BYTES) {
        return { error: "文件过大，请压缩后重试" };
      }
      return `data:${file.contentType};base64,${file.data.toString("base64")}`;
    });
  const imageError = images.find((item) => typeof item === "object" && item.error);
  if (imageError) {
    return res.status(400).json({
      success: false,
      ok: false,
      code: "ATTACHMENT_TOO_LARGE",
      message: imageError.error,
      error: imageError.error,
    });
  }

  const linkedImages = parseImagesField(fields.input_images || fields.inputImages || fields.images);
  const payload = buildImageEndpointPayload({
    ...fields,
    images: [...linkedImages, ...images.filter((item) => typeof item === "string")],
  });
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
    endpoint: "/api/images/generate",
    actionType: String(fields.actionType || fields.action_type || ""),
    sourceImageId: String(fields.sourceImageId || fields.source_image_id || ""),
    sourceGenerationId: String(fields.sourceGenerationId || fields.source_generation_id || ""),
    avoidImageId: String(fields.avoidImageId || fields.avoid_image_id || ""),
  });

  const firstImage = Array.isArray(result.images) && result.images[0]
    ? { url: result.images[0], width: 0, height: 0 }
    : null;

  return res.status(result.status || (result.ok ? 200 : 500)).json({
    ...result,
    success: Boolean(result.ok),
    generationId: result.requestId,
    conversationId: fields.conversationId || "",
    model: result.modelId || payload.modelId,
    provider: "FlowAPI",
    images: Array.isArray(result.images) ? result.images.map((url) => ({ url, width: 0, height: 0 })) : [],
    firstImage,
    usage: {
      tokens: result.tokenCost || 0,
      costCny: result.moneyCost || 0,
      balanceAfterCny: result.balanceAfter || 0,
      durationMs: result.latencyMs || 0,
    },
    createdAt: new Date().toISOString(),
    message: result.error || result.friendlyMessage || "",
  });
}
