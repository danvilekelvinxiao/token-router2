/* eslint-disable @next/next/no-img-element */
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import FlowApiBrandText from "@/components/brand/flowapi-brand-text";
import UsageDeltaBadge from "@/components/common/usage-delta-badge";
import ConsoleLayout from "@/components/ConsoleLayout";
import ImageCostIsland from "@/components/images/image-cost-island";

const DEFAULT_MODEL_ID = "flowapi-seedream-45";
const MODEL_STORAGE_KEY = "flowapi_default_image_model";
const DEFAULT_IMAGE_PROMPT = "请基于上传的参考图生成一张高质量图片，保留主体特征，画面干净清晰。";
const MAX_ATTACHMENTS = 5;
const IMAGE_MODEL_CATEGORIES = ["全部", "OpenAI 图片", "Google 图片", "Grok", "Seedream", "低成本", "高质量", "中文友好"];

const ATTACHMENT_LIMITS = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  file: 20 * 1024 * 1024,
};

const ALLOWED_MIME = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "application/pdf": "file",
  "text/plain": "file",
};

function getGenerationStage(progress, hasImages) {
  if (progress < 18) return hasImages ? "正在上传参考图" : "正在整理你的需求";
  if (progress < 42) return hasImages ? "正在分析参考图与修改要求" : "正在匹配图片模型";
  if (progress < 72) return "正在生成画面主体";
  if (progress < 92) return "正在补细节与提高清晰度";
  return "正在整理结果与写入日志";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function estimateCost(model, quality, count, hasImages) {
  if (!model) return { token: 0, money: 0 };
  const multiplier = quality === "ultra" ? 2.2 : quality === "hd" ? 1.6 : 1;
  const tokenBase = hasImages ? Number(model.unitPriceTokenImageToImage || model.unitPriceTokenTextToImage || 0) : Number(model.unitPriceTokenTextToImage || 0);
  const moneyBase = hasImages ? Number(model.unitPriceRmbImageToImage || model.unitPriceRmbTextToImage || 0) : Number(model.unitPriceRmbTextToImage || 0);
  return {
    token: Number((tokenBase * multiplier * count).toFixed(1)),
    money: Number((moneyBase * multiplier * count).toFixed(2)),
  };
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function hasPositiveNumber(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) > 0;
}

function formatTokenValue(value) {
  return hasPositiveNumber(value) ? `${Number(value).toFixed(1)} Token` : "数据同步中";
}

function formatMoneyValue(value) {
  return hasPositiveNumber(value) ? `¥${Number(value).toFixed(2)}` : "数据同步中";
}

function formatLatencyValue(value) {
  if (!hasPositiveNumber(value)) return "数据同步中";
  const ms = Number(value);
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function buildDownloadHref(item, index, src) {
  if (item?.requestId) {
    return `/api/images/download?requestId=${encodeURIComponent(item.requestId)}&index=${index}`;
  }
  return src || "";
}

function modelMatchesCategory(model, category) {
  if (!category || category === "全部") return true;
  const haystack = [
    model?.displayName,
    model?.id,
    model?.provider,
    model?.sceneDescription,
    ...(model?.labelTags || []),
    ...(model?.tags || []),
  ].join(" ");
  if (category === "Google 图片") return haystack.includes("Google") || haystack.includes("Gemini");
  if (category === "Grok") return haystack.includes("Grok");
  if (category === "Seedream") return haystack.includes("Seedream");
  return haystack.includes(category);
}

function getModelMark(model) {
  const provider = String(`${model?.provider || ""} ${model?.displayName || ""} ${model?.id || ""}`).toLowerCase();
  if (provider.includes("gpt") || provider.includes("openai")) return "AI";
  if (provider.includes("gemini") || provider.includes("google")) return "GM";
  if (provider.includes("grok") || provider.includes("x-ai")) return "GX";
  if (provider.includes("seedream") || provider.includes("bytedance")) return "SD";
  return "IM";
}

function ModelLogo({ model }) {
  return <span className="image-model-logo" aria-hidden="true">{getModelMark(model)}</span>;
}

function getAttachmentKind(file) {
  return ALLOWED_MIME[file.type] || "";
}

async function buildAttachment(file) {
  const kind = getAttachmentKind(file);
  if (!kind) {
    return { error: "该文件类型暂不支持" };
  }
  const limit = ATTACHMENT_LIMITS[kind] || ATTACHMENT_LIMITS.file;
  if (file.size > limit) {
    return { error: "文件过大，请压缩后重试" };
  }
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
    file,
    name: file.name || `${kind}-attachment`,
    size: file.size,
    mime: file.type,
    kind,
    preview: kind === "image" ? await fileToDataUrl(file) : "",
  };
}

function AttachmentCard({ attachment, onRemove }) {
  return (
    <div className={`image-attachment-card is-${attachment.kind}`}>
      <div className="image-attachment-preview">
        {attachment.kind === "image" ? (
          <img src={attachment.preview} alt={attachment.name} />
        ) : (
          <span>{attachment.kind === "video" ? "VID" : "FILE"}</span>
        )}
      </div>
      <div>
        <strong>{attachment.name}</strong>
        <small>{attachment.kind === "image" ? "图片" : attachment.kind === "video" ? "视频" : "文件"} · {formatBytes(attachment.size)}</small>
      </div>
      <button type="button" onClick={() => onRemove(attachment.id)} aria-label={`删除 ${attachment.name}`}>×</button>
    </div>
  );
}

function ImageGenerationBubble({ model, elapsed, progress, stage, hasImages }) {
  return (
    <div className="image-chat-row is-assistant">
      <div className="image-chat-avatar">F</div>
      <div className="image-generation-bubble" aria-live="polite">
        <div className="image-generation-bubble-main">
          <strong><FlowApiBrandText className="image-inline-brand" /> 正在生成图片</strong>
          <div className="image-typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
        <p>正在使用 {model?.displayName || "图片模型"} 生成 · 已等待 {elapsed.toFixed(1)}s</p>
        <div className="image-generation-progress">
          <span style={{ width: `${Math.min(99, Math.max(8, progress))}%` }} />
        </div>
        <small>{stage} · {hasImages ? "图生图 / 改图" : "文生图"}</small>
      </div>
    </div>
  );
}

function UserMessage({ prompt, attachments }) {
  if (!prompt && !attachments.length) return null;
  return (
    <div className="image-chat-row is-user">
      <div className="image-chat-message">
        {attachments.length ? (
          <div className="image-chat-attachments">
            {attachments.map((attachment) => (
              <div key={attachment.id} className={`image-chat-attachment is-${attachment.kind}`}>
                {attachment.kind === "image" ? <img src={attachment.preview} alt={attachment.name} /> : <span>{attachment.kind === "video" ? "VID" : "FILE"}</span>}
              </div>
            ))}
          </div>
        ) : null}
        <p>{prompt || "基于参考图生成一张高质量图片"}</p>
      </div>
    </div>
  );
}

function ResultMessage({ item, model, onRefineFromImage, onRegenerateImage, onCopyLink, onPreview }) {
  const outputImages = Array.isArray(item.outputImageUrls) ? item.outputImageUrls : [];
  const inputImages = Array.isArray(item.inputImageUrls) ? item.inputImageUrls : [];
  const imageCosts = Array.isArray(item.imageCosts)
    ? item.imageCosts
    : Array.isArray(item.metadata?.imageCosts)
      ? item.metadata.imageCosts
      : [];
  return (
    <div className="image-chat-pair">
      <div className="image-chat-row is-user">
        <div className="image-chat-message">
          {inputImages.length ? (
            <div className="image-chat-attachments">
              {inputImages.slice(0, 4).map((src, index) => (
                <div key={`${item.id}-input-${index}`} className="image-chat-attachment is-image">
                  <img src={src} alt={`参考图 ${index + 1}`} />
                </div>
              ))}
            </div>
          ) : null}
          <p>{item.prompt || item.promptPreview || "图片生成需求"}</p>
        </div>
      </div>

      <div className="image-chat-row is-assistant">
        <div className="image-chat-avatar">F</div>
        <article className="image-result-bubble">
          <div className="image-result-head">
            <div>
              <span>生成图片</span>
              <strong>{item.status === "failed" ? "生成失败，未扣费" : "图片生成完成"}</strong>
            </div>
            <div className="image-result-side">
              <div className="image-result-model">
                <ModelLogo model={model || { displayName: item.modelDisplayName, provider: item.upstreamProvider }} />
                <span>{item.modelDisplayName || "数据同步中"}</span>
              </div>
              {item.status === "failed" ? null : (
                <UsageDeltaBadge tokens={item.tokenCost} costCny={item.moneyCost} durationMs={item.latencyMs} />
              )}
            </div>
          </div>

          {outputImages.length ? (
            <div className={`image-result-grid image-result-grid-count-${Math.min(4, outputImages.length)}`}>
              {outputImages.map((src, index) => (
                <div key={`${item.id}-output-${index}`} className="image-result-tile-card">
                  <button type="button" onClick={() => onPreview(src)} className="image-result-tile">
                    <img src={src} alt={`生成结果 ${index + 1}`} />
                  </button>
                  {imageCosts[index] ? (
                    <div className="image-result-image-cost">
                      <span>{formatTokenValue(imageCosts[index].tokenCost ?? imageCosts[index].tokens)}</span>
                      <span>{formatMoneyValue(imageCosts[index].moneyCost ?? imageCosts[index].costCny)}</span>
                    </div>
                  ) : null}
                  <div className="image-result-image-actions">
                    <a href={buildDownloadHref(item, index, src)} download target="_blank" rel="noreferrer">下载</a>
                    <button type="button" onClick={() => onRefineFromImage?.(item, src, index)}>基于图片生成</button>
                    <button type="button" onClick={() => onRegenerateImage?.(item, src, index)}>重新生成相似图</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="image-result-empty">{item.errorMessage || "结果数据同步中"}</div>
          )}

          {outputImages.length > 1 ? (
            <div className="image-result-group-summary">
              <span>总 Token：{formatTokenValue(item.tokenCost)}</span>
              <span>总花费：{formatMoneyValue(item.moneyCost)}</span>
              <span>余额：{formatMoneyValue(item.balanceAfter)}</span>
              <span>耗时：{formatLatencyValue(item.latencyMs)}</span>
            </div>
          ) : null}

          {item.errorMessage ? <div className="image-log-error">{item.errorMessage}</div> : null}

          <div className="image-log-actions">
            <button type="button" onClick={() => onCopyLink?.(outputImages[0] || "")}>复制图片链接</button>
            <a href={`/dashboard/logs?requestId=${encodeURIComponent(item.requestId || "")}`}>查看调用详情</a>
          </div>
        </article>
      </div>
    </div>
  );
}

export default function ImagesPage() {
  const [customer] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("flowapi_customer");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [models, setModels] = useState([]);
  const [history, setHistory] = useState([]);
  const [transientResults, setTransientResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [modelCategory, setModelCategory] = useState("全部");
  const [attachments, setAttachments] = useState([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [quality, setQuality] = useState("standard");
  const [count, setCount] = useState(1);
  const [styleConsistency, setStyleConsistency] = useState("balanced");
  const [referenceStrength, setReferenceStrength] = useState("medium");
  const [saveHistory, setSaveHistory] = useState(true);
  const [autoRetry, setAutoRetry] = useState(true);
  const [polishing, setPolishing] = useState(false);
  const [previousPrompt, setPreviousPrompt] = useState("");
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState("");
  const [generationProgress, setGenerationProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerContext, setModelPickerContext] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [pendingMessage, setPendingMessage] = useState(null);
  const chatFeedRef = useRef(null);
  const fileInputRef = useRef(null);

  const selectedModel = models.find((item) => item.id === modelId) || models[0] || null;
  const filteredModels = models.filter((item) => modelMatchesCategory(item, modelCategory));
  const imageAttachments = attachments.filter((item) => item.kind === "image");
  const unsupportedAttachments = attachments.filter((item) => item.kind !== "image");
  const estimatedCost = estimateCost(selectedModel, quality, count, imageAttachments.length > 0);
  const generationStage = getGenerationStage(generationProgress, imageAttachments.length > 0);
  const canSubmit = Boolean(prompt.trim() || attachments.length) && !sending;
  const chatHistory = useMemo(() => [...history, ...transientResults].reverse(), [history, transientResults]);

  useEffect(() => {
    let cancelled = false;
    async function loadPage() {
      try {
        const [modelsRes, historyRes, summaryRes] = await Promise.all([
          fetch("/api/image-models"),
          fetch("/api/images/history?limit=12"),
          fetch("/api/images/summary"),
        ]);
        const [modelsJson, historyJson, summaryJson] = await Promise.all([
          modelsRes.json(),
          historyRes.json(),
          summaryRes.json(),
        ]);
        if (cancelled) return;
        const nextModels = Array.isArray(modelsJson.models) ? modelsJson.models : [];
        const storedModel = typeof window !== "undefined" ? localStorage.getItem(MODEL_STORAGE_KEY) : "";
        const fallbackModel = nextModels[0]?.id || DEFAULT_MODEL_ID;
        setModels(nextModels);
        setModelId(nextModels.some((item) => item.id === storedModel) ? storedModel : fallbackModel);
        setHistory(Array.isArray(historyJson.items) ? historyJson.items : []);
        setSummary(summaryJson.summary || null);
      } catch {
        if (!cancelled) setError("图片工作台初始化失败，请刷新重试。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadPage();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!sending) return undefined;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed((Date.now() - startedAt) / 1000);
      setGenerationProgress((current) => {
        if (current >= 92) return current;
        if (current < 18) return current + 6;
        if (current < 42) return current + 5;
        if (current < 72) return current + 3;
        return current + 2;
      });
    }, 300);
    return () => window.clearInterval(timer);
  }, [sending]);

  useEffect(() => {
    const target = chatFeedRef.current;
    if (!target) return;
    target.scrollTo({ top: target.scrollHeight, behavior: "smooth" });
  }, [chatHistory.length, sending, pendingMessage]);

  async function reloadHistory() {
    const [historyRes, summaryRes] = await Promise.all([
      fetch("/api/images/history?limit=12"),
      fetch("/api/images/summary"),
    ]);
    const [historyJson, summaryJson] = await Promise.all([historyRes.json(), summaryRes.json()]);
    setHistory(Array.isArray(historyJson.items) ? historyJson.items : []);
    setSummary(summaryJson.summary || null);
  }

  function chooseModel(nextModelId) {
    setModelId(nextModelId);
    setModelPickerOpen(false);
    setModelPickerContext("");
    if (typeof window !== "undefined") localStorage.setItem(MODEL_STORAGE_KEY, nextModelId);
  }

  function openModelPicker(context) {
    setModelPickerContext(context);
    setModelPickerOpen((value) => (modelPickerContext === context ? !value : true));
  }

  function renderModelMenu(context) {
    if (!modelPickerOpen || modelPickerContext !== context) return null;
    return (
      <div className="image-model-menu">
        {models.map((item) => (
          <button key={item.id} type="button" onClick={() => chooseModel(item.id)} className={item.id === modelId ? "active" : ""}>
            <ModelLogo model={item} />
            <span>
              <strong>{item.displayName}</strong>
              <small>{(item.labelTags || []).slice(0, 3).join(" / ")} · ¥{Number(item.unitPriceRmbTextToImage || 0).toFixed(2)} 起</small>
            </span>
          </button>
        ))}
      </div>
    );
  }

  async function addFiles(nextFiles) {
    const incoming = Array.from(nextFiles || []);
    if (!incoming.length) return;
    const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    if (!remaining) {
      setError(`单次最多 ${MAX_ATTACHMENTS} 个附件`);
      return;
    }
    const transformed = [];
    let message = "";
    for (const file of incoming.slice(0, remaining)) {
      const attachment = await buildAttachment(file);
      if (attachment.error) {
        message = attachment.error;
      } else {
        transformed.push(attachment);
      }
    }
    if (message) setError(message);
    if (transformed.length) {
      setAttachments((current) => [...current, ...transformed].slice(0, MAX_ATTACHMENTS));
      const firstKind = transformed[0].kind === "image" ? "图片" : transformed[0].kind === "video" ? "视频" : "文件";
      setNotice({ type: "info", title: `已添加${firstKind}`, message: "附件已进入输入框预览区" });
      setError("");
    }
  }

  function removeAttachment(id) {
    setAttachments((current) => current.filter((item) => item.id !== id));
  }

  async function handlePaste(event) {
    const files = Array.from(event.clipboardData?.files || []);
    if (!files.length) return;
    event.preventDefault();
    await addFiles(files);
  }

  async function polishPrompt() {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setError("请先输入你的图片需求，再点击润色。");
      return;
    }
    if (polishing) return;
    setPolishing(true);
    setError("");
    try {
      const response = await fetch("/api/images/prompt-polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: cleanPrompt,
          model: modelId,
          attachments: attachments.map((item) => ({
            type: item.kind,
            name: item.name,
            mime: item.mime,
          })),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error || "润色失败，请稍后重试。");
        return;
      }
      setPreviousPrompt(cleanPrompt);
      setPrompt(json.polishedPrompt || cleanPrompt);
      setNotice({ type: "info", title: "润色完成", message: "已保留原意并补充画面细节" });
    } catch {
      setError("润色失败，请稍后重试。");
    } finally {
      setPolishing(false);
    }
  }

  function undoPolish() {
    if (!previousPrompt) return;
    setPrompt(previousPrompt);
    setPreviousPrompt("");
  }

  async function submitGeneration(options = {}) {
    const {
      promptOverride = "",
      linkedImagesOverride = null,
      pendingLabel = "",
      actionType = "",
      sourceImageId = "",
      sourceGenerationId = "",
      avoidImageId = "",
      forcedCount = null,
      clearComposer = true,
    } = options;
    if (!customer?.id) {
      window.location.href = "/login";
      return;
    }
    if (sending) {
      setError("正在生成上一张图片，请稍等。");
      return;
    }
    const hasLinkedOverride = Array.isArray(linkedImagesOverride);
    if (!promptOverride.trim() && !prompt.trim() && !attachments.length && !hasLinkedOverride) return;
    if (!hasLinkedOverride && unsupportedAttachments.length) {
      setError("当前图片模型暂不支持视频 / 文件作为生成输入，请先删除或换成图片参考。");
      return;
    }

    const activeImageAttachments = hasLinkedOverride ? [] : imageAttachments;
    const linkedImages = hasLinkedOverride ? linkedImagesOverride.filter(Boolean) : [];
    const userPrompt = promptOverride.trim() || prompt.trim();
    const effectivePrompt = userPrompt || (activeImageAttachments.length || linkedImages.length ? DEFAULT_IMAGE_PROMPT : "");
    const pendingAttachments = hasLinkedOverride
      ? linkedImages.slice(0, 4).map((src, index) => ({
          id: `linked-${Date.now()}-${index}`,
          file: null,
          name: `参考图-${index + 1}`,
          size: 0,
          mime: "image/png",
          kind: "image",
          preview: src,
        }))
      : attachments.map((item) => ({ ...item, file: null }));
    const outputCount = Math.max(1, Math.min(4, Number(forcedCount || count || 1)));
    setPendingMessage({ prompt: pendingLabel || userPrompt, attachments: pendingAttachments });
    setSending(true);
    setGenerationProgress(8);
    setElapsed(0);
    setError("");
    try {
      const formData = new FormData();
      formData.append("prompt", effectivePrompt);
      formData.append("model", modelId);
      formData.append("aspect_ratio", aspectRatio);
      formData.append("quality", quality);
      formData.append("n", String(outputCount));
      formData.append("save_history", String(saveHistory));
      formData.append("auto_retry", String(autoRetry));
      formData.append("return_format", "url");
      formData.append("style_consistency", styleConsistency);
      formData.append("reference_strength", referenceStrength);
      if (actionType) formData.append("actionType", actionType);
      if (sourceImageId) formData.append("sourceImageId", sourceImageId);
      if (sourceGenerationId) formData.append("sourceGenerationId", sourceGenerationId);
      if (avoidImageId) formData.append("avoidImageId", avoidImageId);
      activeImageAttachments.forEach((item) => {
        if (item.file) {
          formData.append("attachments", item.file, item.name);
        } else if (item.preview) {
          linkedImages.push(item.preview);
        }
      });
      if (linkedImages.length) formData.append("input_images", JSON.stringify(linkedImages));

      const response = await fetch("/api/images/generate", {
        method: "POST",
        body: formData,
      });
      const json = await response.json();
      if (!response.ok || (!json.ok && !json.success)) {
        setError(json.error || json.message || "图片生成失败，请稍后重试。");
        setNotice({
          type: "error",
          title: "生成失败，未扣费",
          message: json.error || json.message || "图片生成失败",
          requestId: json.requestId || json.generationId || "",
        });
        return;
      }

      const usage = json.usage || {};
      setNotice({
        type: "success",
        title: json.autoRetried ? "已自动重试成功" : "图片生成成功",
        tokenCost: Number(json.tokenCost ?? usage.tokens ?? 0).toFixed(1),
        moneyCost: Number(json.moneyCost ?? usage.costCny ?? 0).toFixed(2),
        modelDisplayName: json.modelDisplayName || json.model || selectedModel?.displayName,
        balanceAfterText: `¥${Number(json.balanceAfter ?? usage.balanceAfterCny ?? 0).toFixed(2)}`,
      });
      setGenerationProgress(100);
      if (saveHistory === false) {
        const outputImages = Array.isArray(json.images)
          ? json.images.map((item) => (typeof item === "string" ? item : item?.url)).filter(Boolean)
          : [];
        setTransientResults((current) => [
          {
            id: json.generationId || json.requestId || `local-${Date.now()}`,
            requestId: json.requestId || json.generationId || "",
            mode: (linkedImages.length || activeImageAttachments.length) ? "image_to_image" : "text_to_image",
            modelDisplayName: json.modelDisplayName || selectedModel?.displayName || "",
            upstreamProvider: json.provider || selectedModel?.provider || "",
            prompt: effectivePrompt,
            promptPreview: effectivePrompt,
            inputImageUrls: linkedImages.length ? linkedImages : activeImageAttachments.map((item) => item.preview).filter(Boolean),
            outputImageUrls: outputImages,
            outputImageCount: outputImages.length,
            aspectRatio,
            quality,
            tokenCost: json.tokenCost ?? json.usage?.tokens,
            moneyCost: json.moneyCost ?? json.usage?.costCny,
            balanceAfter: json.balanceAfter ?? json.usage?.balanceAfterCny,
            latencyMs: json.latencyMs ?? json.usage?.durationMs,
            status: "success",
            savedToHistory: false,
            metadata: { modelUsedId: json.modelId || modelId },
            createdAt: json.createdAt || new Date().toISOString(),
          },
          ...current,
        ].slice(0, 4));
      }
      if (clearComposer) {
        setPrompt("");
        setAttachments([]);
        setPreviousPrompt("");
      }
      await reloadHistory();
    } catch {
      setError("网络异常，请稍后重试。");
      setNotice({
        type: "error",
        title: "生成失败，未扣费",
        message: "网络异常，请稍后重试",
        requestId: "",
      });
    } finally {
      setSending(false);
      setPendingMessage(null);
      window.setTimeout(() => setGenerationProgress(0), 240);
    }
  }

  function handleKeyDown(event) {
    const shouldSubmit = (event.key === "Enter" && !event.shiftKey) || ((event.metaKey || event.ctrlKey) && event.key === "Enter");
    if (!shouldSubmit) return;
    event.preventDefault();
    submitGeneration();
  }

  async function refineFromImage(item, imageUrl, index = 0) {
    const originalPrompt = item.prompt || item.promptPreview || prompt.trim() || DEFAULT_IMAGE_PROMPT;
    const enhancedPrompt = `请基于上一张生成图片继续优化，保留主体、构图和核心风格，同时进一步贴合用户需求：${originalPrompt}。请增强细节、提升画面完成度，使结果更适合实际使用场景。`;
    await submitGeneration({
      promptOverride: enhancedPrompt,
      linkedImagesOverride: [imageUrl],
      pendingLabel: "基于上一张图片继续优化",
      actionType: "refine-from-image",
      sourceImageId: `${item.requestId || item.id || "image"}:${index}`,
      sourceGenerationId: item.requestId || item.id || "",
      forcedCount: count,
      clearComposer: false,
    });
  }

  async function regenerateDifferentStyle(item, imageUrl, index = 0) {
    const originalPrompt = item.prompt || item.promptPreview || prompt.trim() || DEFAULT_IMAGE_PROMPT;
    const inputRefs = Array.isArray(item.inputImageUrls) ? item.inputImageUrls.filter(Boolean) : [];
    const enhancedPrompt = `请根据用户原始需求重新生成一张不同风格的图片。保持主题和用途一致，但在构图、色彩、背景、光线或视觉风格上与上一张明显不同，避免重复上一张结果。原始需求：${originalPrompt}`;
    await submitGeneration({
      promptOverride: enhancedPrompt,
      linkedImagesOverride: inputRefs,
      pendingLabel: "重新生成一张不同风格的图片",
      actionType: "regenerate-different-style",
      sourceGenerationId: item.requestId || item.id || "",
      avoidImageId: `${item.requestId || item.id || "image"}:${index}:${imageUrl}`,
      forcedCount: count,
      clearComposer: false,
    });
  }

  async function copyLink(value) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setNotice({
      type: "info",
      title: "链接已复制",
      message: "可直接发给同事或客服排查",
    });
  }

  return (
    <>
      <Head>
        <title>FlowAPI 生成图片</title>
      </Head>
      <ConsoleLayout
        customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }}
        currentPath="/images"
      >
        <ImageCostIsland notice={notice} onClose={() => setNotice(null)} />
        <main className="image-studio-page">
          <section className="image-studio-hero">
            <div>
              <span className="image-studio-kicker">Image Studio</span>
              <h1><FlowApiBrandText className="image-title-brand" /> 生成图片</h1>
              <p>输入文字或上传图片，直接生成。无需注册 OpenRouter，无需研究接口，小白也能直接用。</p>
            </div>
            <div className="image-studio-top-cards">
              <article>
                <span>当前余额</span>
                <strong>¥{Number(summary?.currentBalance || customer?.balance || 0).toFixed(2)}</strong>
                <p>余额不足时会直接提醒充值，提示词会保留。</p>
              </article>
              <article className="image-model-card">
                <button type="button" onClick={() => openModelPicker("summary")} className="image-model-card-button" aria-expanded={modelPickerOpen && modelPickerContext === "summary"}>
                  <span>当前默认模型</span>
                  <strong><ModelLogo model={selectedModel} />{selectedModel?.displayName || "加载中"}</strong>
                  <p>{selectedModel?.labelTags?.slice(0, 2).join(" / ") || "推荐 / 稳定"} · 点击切换</p>
                </button>
                {renderModelMenu("summary")}
              </article>
              <article>
                <span>预计还能生成</span>
                <strong>{Number(summary?.estimatedRemainingImages || 0)} 张</strong>
                <p>按当前最低成本图片模型估算，仅供参考。</p>
              </article>
            </div>
          </section>

          {!customer?.id ? (
            <section className="image-studio-guest">
              <h2>注册、充值后，就能直接在网页里生成图片</h2>
              <p>不用研究 API，不用理解文生图和图生图差别，<FlowApiBrandText className="image-inline-brand" /> 会自动帮你判断。</p>
              <div className="image-studio-guest-actions">
                <Link href="/register">立即注册</Link>
                <Link href="/recharge" className="secondary">先看充值</Link>
              </div>
            </section>
          ) : null}

          <section className="image-studio-shell">
            <div className="image-studio-main">
              <div className="image-studio-model-stage">
                <button
                  type="button"
                  className="image-studio-gradient-model"
                  onClick={() => openModelPicker("workspace")}
                  aria-label="切换图片生成模型"
                  aria-expanded={modelPickerOpen && modelPickerContext === "workspace"}
                >
                  {selectedModel?.displayName || "选择模型"}
                </button>
                {renderModelMenu("workspace")}
              </div>

              <div className="image-model-shelf">
                <div className="image-model-category-row" aria-label="图片模型分类">
                  {IMAGE_MODEL_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className={modelCategory === category ? "active" : ""}
                      onClick={() => setModelCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <div className="image-model-card-grid">
                  {filteredModels.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === modelId ? "selected" : ""}
                      onClick={() => chooseModel(item.id)}
                    >
                      <span className="image-model-card-title"><ModelLogo model={item} />{item.displayName}</span>
                      <small>{(item.labelTags || []).slice(0, 3).join(" / ") || "图片模型"}</small>
                      <p>{item.sceneDescription || "适合商业图片生成场景。"}</p>
                      <em>每张约 ¥{Number(item.unitPriceRmbTextToImage || 0).toFixed(2)} 起</em>
                    </button>
                  ))}
                </div>
              </div>

              <div className="image-chat-feed" ref={chatFeedRef}>
                {loading ? <div className="image-studio-empty">正在加载图片历史...</div> : null}
                {!loading && !chatHistory.length && !sending ? (
                  <div className="image-studio-empty">
                    <strong>你的第一张图片可以从这里开始</strong>
                    <p>输入一句话，或者直接粘贴商品图、人物图、海报草图，再告诉我你想怎么改。</p>
                  </div>
                ) : null}
                {chatHistory.map((item) => (
                  <ResultMessage
                    key={item.id}
                    item={item}
                    model={models.find((model) => model.displayName === item.modelDisplayName || model.id === item.metadata?.modelUsedId)}
                    onRefineFromImage={refineFromImage}
                    onRegenerateImage={regenerateDifferentStyle}
                    onCopyLink={copyLink}
                    onPreview={setPreviewImage}
                  />
                ))}
                {sending && pendingMessage ? <UserMessage prompt={pendingMessage.prompt} attachments={pendingMessage.attachments} /> : null}
                {sending ? (
                  <ImageGenerationBubble
                    model={selectedModel}
                    elapsed={elapsed}
                    progress={generationProgress}
                    stage={generationStage}
                    hasImages={imageAttachments.length > 0}
                  />
                ) : null}
              </div>

              <div className="image-studio-composer" onPaste={handlePaste}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,video/mp4,video/webm,application/pdf,text/plain"
                  multiple
                  className="image-studio-hidden-file"
                  onChange={async (event) => {
                    await addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />

                <div className="image-studio-advanced-card">
                  <div className="image-studio-advanced-head">
                    <div>
                      <span>高级设置</span>
                      <strong>{count > 1 ? `自动生成 ${count} 张类似风格图片` : "默认生成 1 张图片"}</strong>
                    </div>
                    <button type="button" className="image-studio-advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)}>
                      {advancedOpen ? "收起" : "展开"}
                    </button>
                  </div>

                  {!advancedOpen ? (
                    <div className="image-studio-advanced-compact">
                      <span>{selectedModel?.displayName || "模型加载中"}</span>
                      <span>{aspectRatio}</span>
                      <span>{count} 张</span>
                    </div>
                  ) : (
                    <div className="image-studio-advanced-grid">
                      <div className="image-advanced-model-picker">
                        <span>模型</span>
                        <button type="button" className="image-model-inline-button" onClick={() => openModelPicker("advanced")} aria-expanded={modelPickerOpen && modelPickerContext === "advanced"}>
                          <ModelLogo model={selectedModel} />
                          {selectedModel?.displayName || "选择模型"}
                        </button>
                        {renderModelMenu("advanced")}
                      </div>
                      <label>
                        <span>图片比例</span>
                        <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                          <option value="1:1">1:1</option>
                          <option value="4:3">4:3</option>
                          <option value="3:4">3:4</option>
                          <option value="16:9">16:9</option>
                          <option value="9:16">9:16</option>
                        </select>
                      </label>
                      <label>
                        <span>生成数量</span>
                        <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
                          <option value={1}>1 张</option>
                          <option value={2}>2 张</option>
                          <option value={4}>4 张</option>
                        </select>
                      </label>
                      <label>
                        <span>风格一致性</span>
                        <select value={styleConsistency} onChange={(event) => setStyleConsistency(event.target.value)}>
                          <option value="balanced">均衡</option>
                          <option value="strong">更一致</option>
                          <option value="creative">更发散</option>
                        </select>
                      </label>
                      <label>
                        <span>参考强度</span>
                        <select value={referenceStrength} onChange={(event) => setReferenceStrength(event.target.value)}>
                          <option value="medium">中等</option>
                          <option value="high">强参考</option>
                          <option value="low">弱参考</option>
                        </select>
                      </label>
                      <label>
                        <span>图片质量</span>
                        <select value={quality} onChange={(event) => setQuality(event.target.value)}>
                          <option value="standard">标准</option>
                          <option value="hd">高清</option>
                          <option value="ultra">超清</option>
                        </select>
                      </label>
                      <label className="checkbox">
                        <input type="checkbox" checked={saveHistory} onChange={(event) => setSaveHistory(event.target.checked)} />
                        <span>保存到图片历史</span>
                      </label>
                      <label className="checkbox">
                        <input type="checkbox" checked={autoRetry} onChange={(event) => setAutoRetry(event.target.checked)} />
                        <span>开启自动重试</span>
                      </label>
                    </div>
                  )}
                  <p className="image-studio-advanced-hint">一次生成多张相同需求、相似风格但细节不同的图片，方便你挑选。</p>
                </div>

                {attachments.length ? (
                  <div className="image-attachment-strip">
                    {attachments.map((attachment) => (
                      <AttachmentCard key={attachment.id} attachment={attachment} onRemove={removeAttachment} />
                    ))}
                  </div>
                ) : null}

                <div className="image-studio-textarea-wrap">
                  <div className="image-studio-prompt-head">
                    <label htmlFor="image-studio-prompt">你的图片需求</label>
                    <div className="image-studio-prompt-actions">
                      <button type="button" onClick={() => fileInputRef.current?.click()}>添加附件</button>
                      <button type="button" onClick={polishPrompt} disabled={polishing}>{polishing ? "润色中..." : "润色"}</button>
                      {previousPrompt ? <button type="button" onClick={undoPolish}>撤销润色</button> : null}
                    </div>
                  </div>
                  <textarea
                    id="image-studio-prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入你的图片生成需求，或直接粘贴图片 / 视频 / 文件..."
                    rows={4}
                  />
                </div>

                <div
                  className="image-studio-upload-box"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={async (event) => {
                    event.preventDefault();
                    await addFiles(event.dataTransfer.files);
                  }}
                >
                  <div>
                    <strong>粘贴或拖拽附件</strong>
                    <p>图片最大 10MB，视频最大 50MB，文件最大 20MB。第一版仅图片会进入真实生成请求。</p>
                  </div>
                  <button type="button" className="image-studio-upload-button" onClick={() => fileInputRef.current?.click()}>添加附件</button>
                </div>

                <div className="image-studio-estimate-bar">
                  <div>
                    <span>本次预计扣费</span>
                    <strong>约 ¥{estimatedCost.money.toFixed(2)} / {estimatedCost.token.toFixed(1)} Token</strong>
                  </div>
                  <p>{count > 1 ? "生成多张图片会消耗更多 Token，请确认余额充足。" : "生成失败不扣费。Enter 发送，Shift + Enter 换行。"}</p>
                </div>

                {error ? <div className="image-studio-error-box">{error} {String(error).includes("余额") ? <Link href="/recharge">立即充值</Link> : null}</div> : null}

                <div className="image-studio-submit-row">
                  <div>
                    <strong>{imageAttachments.length ? "系统将自动按图生图 / 改图处理" : "系统将自动按文生图处理"}</strong>
                    <p>{selectedModel?.sceneDescription || "默认推荐模型适合大多数商业场景。"}</p>
                  </div>
                  <button type="button" disabled={!canSubmit} onClick={submitGeneration}>
                    {sending ? "生成中..." : "生成图片"}
                  </button>
                </div>
              </div>
            </div>

            <aside className="image-studio-sidepanel">
              <section>
                <h3>本月图片能力</h3>
                <div className="image-studio-side-metrics">
                  <article><span>今日生成图片数</span><strong>{summary?.todayImages || 0}</strong></article>
                  <article><span>今日消耗 Token</span><strong>{Number(summary?.todayTokens || 0).toFixed(1)}</strong></article>
                  <article><span>今日消耗金额</span><strong>¥{Number(summary?.todayMoney || 0).toFixed(2)}</strong></article>
                  <article><span>最常用图片模型</span><strong>{summary?.topModel || "暂无"}</strong></article>
                </div>
              </section>

              <section>
                <h3>继续操作</h3>
                <div className="image-studio-side-links">
                  <Link href="/images/history">查看图片历史</Link>
                  <Link href="/dashboard/logs">查看使用日志</Link>
                  <Link href="/recharge">去充值额度</Link>
                  <Link href="/help/images">查看使用指南</Link>
                </div>
              </section>
            </aside>
          </section>
        </main>

        {previewImage ? (
          <div className="image-preview-modal" role="dialog" aria-modal="true" onClick={() => setPreviewImage("")}>
            <button type="button" aria-label="关闭图片预览">×</button>
            <img src={previewImage} alt="生成图片预览" />
          </div>
        ) : null}
      </ConsoleLayout>
    </>
  );
}
