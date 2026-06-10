import { logActivity } from "@/lib/customer-store";
import { getClientIp } from "@/lib/security";
import { requireCustomerSession } from "@/lib/session";

function compactText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildPolishedPrompt(prompt = "", attachments = []) {
  const clean = compactText(prompt);
  const hasImage = Array.isArray(attachments) && attachments.some((item) => String(item?.type || item?.kind || "").includes("image"));
  const context = hasImage ? "请基于上传的参考图片，" : "请生成一张图片，";
  const usageHint = hasImage ? "保持主体真实清晰，延续参考图的核心信息，" : "画面主体明确，";
  const sceneHint = "构图干净有层次，光线自然，背景与主题匹配，细节完整，适合实际商业使用。";
  return `${context}${usageHint}${clean}。${sceneHint}`.replace(/。。+/g, "。");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const prompt = compactText(req.body?.prompt || "");
  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: "请先输入你的图片需求，再点击润色。",
    });
  }

  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 5) : [];
  const polishedPrompt = buildPolishedPrompt(prompt, attachments);

  await logActivity({
    customerId: session.customerId,
    action: "image_prompt_polish",
    category: "image",
    detail: `润色图片提示词：${prompt.slice(0, 80)}`,
    amount: 0,
    ip: getClientIp(req),
    userAgent: String(req.headers["user-agent"] || ""),
  });

  return res.status(200).json({
    success: true,
    originalPrompt: prompt,
    polishedPrompt,
    usage: {
      tokens: 0,
      costCny: 0,
    },
  });
}
