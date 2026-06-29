import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { getPublicModelDisplayName, getPublicModelRequestId } from "@/lib/models";
import { getPublicApiBaseUrl } from "@/lib/public-api";

const apiBaseUrl = getPublicApiBaseUrl();

const modelDirectory = [
  { name: "GPT5.4 mini", modelId: "gpt-5.5", provider: "FlowAPI", bestFor: "日常对话、总结、通用任务" },
  { name: "GPT5.4 Pro", modelId: "gpt-5.4-pro", provider: "FlowAPI", bestFor: "高质量推理、代码审查、专业办公" },
  { name: "DeepSeek V4 Flash", modelId: "deepseek-chat", provider: "FlowAPI", bestFor: "中文内容、客服、批量文案" },
  { name: "Qwen3-32B", modelId: "qwen/qwen3-32b", provider: "FlowAPI", bestFor: "外贸邮件、商务沟通、中文办公" },
  { name: "GPT5.5", modelId: "gpt-5.5", provider: "FlowAPI", bestFor: "复杂分析、结构化总结、代码辅助" },
  { name: "Claude Haiku", modelId: "anthropic/claude-3.5-haiku", provider: "FlowAPI", bestFor: "长文分析、英文写作、轻量推理" },
  { name: "Kimi", modelId: "moonshot/kimi-k2", provider: "FlowAPI", bestFor: "长文阅读、资料整理、中文知识库" },
  { name: "GLM", modelId: "zhipu/glm-4.5", provider: "FlowAPI", bestFor: "办公问答、中文任务、轻量推理" },
];

function getSelectedModel(queryModel) {
  const cleanModel = typeof queryModel === "string" ? queryModel : "";
  return modelDirectory.find((model) => model.modelId === cleanModel) || {
    name: getPublicModelDisplayName(cleanModel || "gpt-5.5"),
    modelId: getPublicModelRequestId(cleanModel || "gpt-5.5"),
    provider: "FlowAPI",
    bestFor: "通用任务",
  };
}

export default function ApiAccessPage() {
  const router = useRouter();
  const [copied, setCopied] = useState("");
  const selectedModel = useMemo(() => getSelectedModel(router.query.model), [router.query.model]);

  const requestExample = `curl ${apiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer 替换成你的 FlowAPI API Key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${selectedModel.modelId}",
    "messages": [
      {"role": "user", "content": "帮我写一封客户跟进邮件"}
    ]
  }'`;

  async function copyText(label, value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("复制失败");
    }
  }

  return (
    <>
      <Head>
        <title>{`${selectedModel.name} API 接入口 - 智流 FlowAPI`}</title>
      </Head>
      <main className="access-shell">
        <div className="access-wrap">
          <nav className="access-nav">
            <Link href="/" className="brand" aria-label="返回智流 FlowAPI 首页">
              <span className="brand-mark">F</span>
              <span>
                <strong>智流</strong>
                <small>FlowAPI</small>
              </span>
            </Link>
            <Link href="/#models" className="ghost-link">返回模型市场</Link>
          </nav>

          <section className="access-hero">
            <div>
              <span className="access-eyebrow">{selectedModel.provider} API ACCESS</span>
              <h1>{selectedModel.name}</h1>
              <p>{selectedModel.bestFor}</p>
            </div>
            <div className="access-status">
              <span>当前状态</span>
              <strong>可接入</strong>
            </div>
          </section>

          <section className="access-grid">
            <div className="access-panel">
              <div className="panel-title">
                <div>
                  <h3>接入参数</h3>
                  <p>{copied ? `${copied} 已复制` : "复制以下三项即可接入 FlowAPI 兼容客户端"}</p>
                </div>
              </div>
              <div className="access-list">
                <div>
                  <span>Base URL</span>
                  <code>{apiBaseUrl}</code>
                  <button type="button" onClick={() => copyText("Base URL", apiBaseUrl)}>复制</button>
                </div>
                <div>
                  <span>API Key</span>
                  <code>在 API 管理页复制真实 API Key</code>
                  <Link href="/api-management">去复制</Link>
                </div>
                <div>
                  <span>Model</span>
                  <code>{selectedModel.modelId}</code>
                  <button type="button" onClick={() => copyText("Model", selectedModel.modelId)}>复制</button>
                </div>
              </div>
            </div>

            <div className="access-panel">
              <div className="panel-title">
                <div>
                  <h3>请求示例</h3>
                  <p>模型卡片点击后会带入对应 model 参数</p>
                </div>
              </div>
              <pre className="code-block">{requestExample}</pre>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
