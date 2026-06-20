import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import { getPublicApiBaseUrl } from "@/lib/public-api";

const API_BASE_URL = getPublicApiBaseUrl();
const DEFAULT_MODEL = "deepseek-chat";
const CHATGPT_MODEL = "openai/gpt-4o-mini";

/* ==================== helpers ==================== */

function CopyButton({ value, label }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="help-copy-btn" onClick={async () => {
      await navigator.clipboard.writeText(value);
      setOk(true);
      setTimeout(() => setOk(false), 1500);
    }}>
      {ok ? "已复制" : label || "复制"}
    </button>
  );
}

function maskToken(token = "") {
  if (!token || token.length <= 14) return "sk-******";
  const prefix = token.startsWith("sk-") ? "sk-" : "";
  const body = token.startsWith("sk-") ? token.slice(3) : token;
  return `${prefix}${body.slice(0, 4)}************${body.slice(-4)}`;
}

/* ==================== TOC ==================== */

const tocSections = [
  { id: "deepseek-guide", label: "DeepSeek 接入教程" },
  { id: "chatgpt-guide", label: "ChatGPT 接入教程" },
  { id: "manual-config", label: "手动配置 API 教程" },
  { id: "preflight-check", label: "接入前检查" },
  { id: "failed-call-checklist", label: "调用失败排查" },
  { id: "error-codes", label: "常见 API 错误码" },
];

/* ==================== Params Card ==================== */

function ParamsCard({ title, value, copyLabel, isKey, placeholder }) {
  const displayValue = isKey && value ? maskToken(value) : value;
  return (
    <div className="help-param-card">
      <div className="help-param-head">
        <span>{title}</span>
        {isKey && !value ? (
          <Link href="/api-management" className="help-go-btn">去创建 API Key</Link>
        ) : (
          <CopyButton value={displayValue} label={copyLabel || "复制"} />
        )}
      </div>
      <div className="help-param-value">
        {isKey && !value ? (
          <span className="help-placeholder">{placeholder || "请先前往 API 管理页面创建 API Key"}</span>
        ) : (
          <code>{displayValue}</code>
        )}
      </div>
    </div>
  );
}

/* ==================== Section: DeepSeek Guide ==================== */

function DeepSeekGuideSection({ customer }) {
  const primaryKey = customer?.apiKeys?.[0];

  return (
    <section id="deepseek-guide" className="help-section">
      <h2>DeepSeek 接入教程</h2>
      <p className="help-section-desc">
        使用 FlowAPI 的 OpenAI 兼容接口，几分钟即可接入 DeepSeek 模型。
      </p>

      <div className="help-model-card">
        <h4>推荐模型</h4>
        <code>deepseek-chat</code>
        <p>适合中文问答、日常对话、轻量代码和高性价比任务。</p>
        <CopyButton value="deepseek-chat" label="复制模型名" />
      </div>

      <h4 className="help-params-title">接入参数</h4>
      <div className="help-params">
        <ParamsCard title="Base URL" value={API_BASE_URL} copyLabel="复制" />
        <ParamsCard title="API Key" value={primaryKey?.token || ""} copyLabel="复制脱敏值" isKey />
        <ParamsCard title="Model" value="deepseek-chat" copyLabel="复制模型名" />
      </div>

      <div className="help-tips-box">
        <h4>使用提示</h4>
        <ul>
          <li>Base URL 固定填写：<code>{API_BASE_URL}</code></li>
          <li>API Key 使用你在 FlowAPI 创建的 Key</li>
          <li>模型名填写：<code>deepseek-chat</code></li>
          <li>如果连接失败，先检查 API Key 是否复制完整，再检查模型名是否填错</li>
        </ul>
      </div>

      <div className="help-guide-btns">
        <Link href="/api-management" className="help-plaza-btn">去 API 管理创建 Key</Link>
        <Link href="/help#preflight-check" className="help-ghost-btn">查看接入前检查</Link>
      </div>
    </section>
  );
}

/* ==================== Section: ChatGPT Guide ==================== */

function ChatGPTGuideSection({ customer }) {
  const primaryKey = customer?.apiKeys?.[0];

  return (
    <section id="chatgpt-guide" className="help-section">
      <h2>ChatGPT 接入教程</h2>
      <p className="help-section-desc">
        使用 FlowAPI 的 OpenAI 兼容接口，将客户端中的 OpenAI 地址替换为 FlowAPI 地址即可使用。
      </p>

      <div className="help-model-card">
        <h4>推荐模型</h4>
        <code>{CHATGPT_MODEL}</code>
        <p>适合日常对话、轻量写作、总结、翻译和通用任务。</p>
        <CopyButton value={CHATGPT_MODEL} label="复制模型名" />
      </div>

      <h4 className="help-params-title">接入参数</h4>
      <div className="help-params">
        <ParamsCard title="Base URL" value={API_BASE_URL} copyLabel="复制" />
        <ParamsCard title="API Key" value={primaryKey?.token || ""} copyLabel="复制脱敏值" isKey />
        <ParamsCard title="Model" value={CHATGPT_MODEL} copyLabel="复制模型名" />
      </div>

      <div className="help-tips-box">
        <h4>使用提示</h4>
        <ul>
          <li>客户端 Base URL 改为：<code>{API_BASE_URL}</code></li>
          <li>API Key 填写 FlowAPI 创建的 Key</li>
          <li>模型名填写平台支持的 OpenAI 模型名</li>
          <li>如果客户端原本支持 OpenAI API，一般只需要替换 Base URL 和 API Key</li>
        </ul>
      </div>

      <div className="help-guide-btns">
        <Link href="/api-management" className="help-plaza-btn">去 API 管理创建 Key</Link>
        <Link href="/models" className="help-ghost-btn">进入大模型广场</Link>
      </div>
    </section>
  );
}

/* ==================== Section: Manual Config ==================== */

function ManualConfigSection({ customer }) {
  const primaryKey = customer?.apiKeys?.[0];

  const params = [
    { title: "Base URL", value: API_BASE_URL, copyLabel: "复制" },
    { title: "API Key", value: primaryKey?.token || "", copyLabel: "复制脱敏值", isKey: true },
    { title: "模型", value: DEFAULT_MODEL, copyLabel: "复制模型名" },
  ];

  return (
    <section id="manual-config" className="help-section">
      <h2>手动配置 API 教程</h2>
      <p className="help-section-desc">
        如果自动配置失败，复制下面三个参数，手动填入 CC-Switch 即可完成接入。
      </p>

      <div className="help-params">
        {params.map((p) => (
          <ParamsCard key={p.title} {...p} />
        ))}
      </div>

      <div className="help-model-plaza">
        <Link href="/models" className="help-plaza-btn">进入大模型广场</Link>
        <p>不知道选哪个模型？进入模型广场，查看不同模型的价格、速度和适合场景。</p>
      </div>

      <div className="help-curl-divider">
        <p className="help-curl-transition">
          如果你想测试接口是否配置成功，可以复制下面的 CURL 示例进行测试。
        </p>
      </div>

      <h3 className="help-sub-heading">CURL 命令参考</h3>
      <p className="help-section-desc">不需要懂命令行，只需要知道替换哪些地方。</p>

      <CurlReferenceContent />
    </section>
  );
}

/* ==================== Curl Content ==================== */

function CurlReferenceContent() {
  const apiKeyPlaceholder = "你生成的 API Key";
  const modelPlaceholder = "你想使用的模型";

  const standardCurl = `curl ${API_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer sk-xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${DEFAULT_MODEL}",
       "messages": [{"role":"user","content":"你好"}]}'`;

  return (
    <>
      <div className="help-curl-grid">
        <div className="help-curl-block">
          <div className="help-curl-title">标准 CURL 示例</div>
          <pre className="help-curl-pre">{standardCurl}</pre>
        </div>
        <div className="help-curl-block">
          <div className="help-curl-title">你只需要替换红色部分</div>
          <pre className="help-curl-pre">
{`curl ${API_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer `}<span className="help-curl-red">{apiKeyPlaceholder}</span>{`" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "`}<span className="help-curl-red">{modelPlaceholder}</span>{`",
       "messages": [{"role":"user","content":"你好"}]}'`}
          </pre>
        </div>
      </div>
      <div className="help-curl-notes">
        <p><strong>只需要改两个地方：</strong></p>
        <ol>
          <li>把“<span className="help-curl-red-inline">{apiKeyPlaceholder}</span>”换成你在 FlowAPI 创建的 <strong>API Key</strong></li>
          <li>把“<span className="help-curl-red-inline">{modelPlaceholder}</span>”修改成模型名比如 <code>{DEFAULT_MODEL}</code></li>
        </ol>
        <p className="help-curl-fixed">Base URL 固定使用：<code>{API_BASE_URL}</code>，不需要修改。</p>
      </div>
    </>
  );
}

/* ==================== Section: Preflight Check ==================== */

const preflightLeft = [
  {
    icon: "🔗", title: "Base URL",
    desc: `统一使用 ${API_BASE_URL}，不要额外拼一次 /v1。`,
    tip: "填错时通常会出现 404、400 或客户端提示连接失败。",
  },
  {
    icon: "🔑", title: "API Key",
    desc: "使用控制台创建的 API Key，复制时不要带空格和换行。",
    tip: "填错时优先看 401。",
  },
  {
    icon: "📦", title: "模型与线路",
    desc: "确认目标模型在「大模型接入」中可见，并且当前 Key 线路允许调用。",
    tip: "线路不匹配时优先看 403。",
  },
  {
    icon: "🛡", title: "IP 白名单",
    desc: "开启白名单时，请确认当前服务器或本机的出口 IP 已放行。",
    tip: "白名单不匹配时通常是 403。",
  },
];

const preflightRight = [
  {
    icon: "🌐", title: "Base URL",
    code: API_BASE_URL,
    desc: "客户端的 Base URL 填到 /v1 结束，endpoint 由工具自动追加。",
  },
  {
    icon: "🔐", title: "Authorization",
    code: "Bearer sk-...",
    desc: "OpenAI 兼容工具通常只需要填 API Key，工具会自动生成 Bearer Header。",
  },
  {
    icon: "📋", title: "Model",
    code: null,
    desc: "不要手写猜模型名；看得到、线路允许，才建议填入客户端。",
    action: true,
  },
];

function PreflightCheckSection() {
  return (
    <section id="preflight-check" className="help-section">
      <h2>接入前检查</h2>
      <p className="help-section-desc">
        新接入或迁移工具时，先把这几项对齐，能避免大多数连接失败问题。
      </p>

      <div className="help-preflight-grid">
        {/* Left: access checks */}
        <div className="help-preflight-col">
          <div className="help-preflight-col-title">接入前检查</div>
          <p className="help-preflight-col-hint">新接入或迁移工具时，先把这 4 项对齐。</p>
          {preflightLeft.map((item) => (
            <div key={item.title} className="help-pf-card">
              <span className="help-pf-icon">{item.icon}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.desc}</p>
                <small>{item.tip}</small>
              </div>
            </div>
          ))}
        </div>

        {/* Right: request config */}
        <div className="help-preflight-col">
          <div className="help-preflight-col-title">请求配置</div>
          <p className="help-preflight-col-hint">先用最小配置跑通，再添加温度、流式、工具调用等高级参数。</p>
          {preflightRight.map((item) => (
            <div key={item.title} className="help-pf-card">
              <span className="help-pf-icon">{item.icon}</span>
              <div>
                <strong>{item.title}</strong>
                {item.code ? (
                  <code>{item.code}</code>
                ) : item.action ? (
                  <Link href="/models" className="help-pf-action">从模型广场复制模型名</Link>
                ) : null}
                <p>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ==================== Section: Failed Call Checklist ==================== */

const failedCallSteps = [
  { title: "先看 code", desc: "FlowAPI 返回的 code 会直接告诉你是 API Key、余额、限流还是模型服务问题。" },
  { title: "再看 suggestion", desc: "接口会返回中文排查建议，小白用户优先照着 suggestion 操作。" },
  { title: "回到 API 管理页检查", desc: "确认当前 API Key 是否已启用、是否绑定了正确模型，并复制完整 Key。" },
  { title: "仍失败再联系客服", desc: "带上 code、suggestion、API Key 名称和调用时间，排查会更快。" },
];

const structuredApiErrors = [
  { code: "MISSING_API_KEY", reason: "没有提供 API Key", fix: "检查 Authorization 是否为 Bearer sk-...，不要只填 Base URL。", href: "/api-management" },
  { code: "INVALID_API_KEY", reason: "API Key 不存在、被禁用或已过期", fix: "回到 API 管理页复制完整 API Key，必要时创建新的 Key。", href: "/api-management" },
  { code: "INSUFFICIENT_BALANCE", reason: "账户余额不足", fix: "先充值，再重新发起调用。", href: "/recharge" },
  { code: "API_KEY_RATE_LIMITED", reason: "请求太频繁", fix: "降低并发或等待一会儿再试，高峰期建议加重试机制。", href: "/help#preflight-check" },
  { code: "UPSTREAM_NOT_CONFIGURED", reason: "模型服务还没有配置好", fix: "这是平台配置问题，请联系 FlowAPI 客服处理。", href: "/help#failed-call-checklist" },
  { code: "UPSTREAM_REQUEST_FAILED", reason: "模型服务没有成功返回", fix: "稍后重试，或切换到其他模型；如果持续失败，请带上 code 联系客服。", href: "/models" },
];

function FailedCallChecklistSection() {
  return (
    <section id="failed-call-checklist" className="help-section">
      <h2>调用失败排查</h2>
      <p className="help-section-desc">
        当 API 调用失败时，不要从头猜。先看返回里的 code 和 suggestion，再按下面路径处理。
      </p>

      <div className="help-failure-steps">
        {failedCallSteps.map((step, index) => (
          <div key={step.title} className="help-failure-step">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step.title}</strong>
            <p>{step.desc}</p>
          </div>
        ))}
      </div>

      <div className="help-structured-errors">
        {structuredApiErrors.map((item) => (
          <div key={item.code} className="help-structured-error-card">
            <code>{item.code}</code>
            <strong>{item.reason}</strong>
            <p>{item.fix}</p>
            <Link href={item.href}>去处理</Link>
          </div>
        ))}
      </div>

      <div className="help-failure-action">
        <div>
          <strong>新手最快验证方式</strong>
          <p>进入 API 管理页，确认 API Key 已启用，并复制 Base URL、API Key、Model ID 三个参数。如果这里有真实调用记录，说明 FlowAPI 账户和 Key 可用。</p>
        </div>
        <Link href="/api-management">去 API 管理页</Link>
      </div>
    </section>
  );
}

/* ==================== Section: Error Codes ==================== */

const errorCodes = [
  { code: "401", title: "Unauthorized — API Key 无效或未提供", desc: "检查 Authorization 请求头是否正确。确认 API Key 是否已过期或被禁用。确认 Base URL 是否正确。" },
  { code: "403", title: "Forbidden — 无权访问", desc: "确认你的账户余额是否充足。检查 API Key 是否有权限访问该模型。某些模型可能需要额外授权。" },
  { code: "429", title: "请求频率过高", desc: "降低并发请求数量。可以实现重试逻辑，等待几秒后再次请求。如果持续出现，联系客服提升限额。" },
  { code: "400", title: "Bad Request — 请求格式错误", desc: "检查请求体 JSON 格式是否正确。确认 model 字段的模型名拼写正确。确认 messages 数组格式符合规范。" },
  { code: "413", title: "Payload Too Large — 请求体过大", desc: "减小 prompt 或上下文长度。分块发送过长的文本内容。使用更小分辨率的图片。" },
  { code: "408", title: "Request Timeout — 请求超时", desc: "模型处理时间过长导致超时。可以降低 max_tokens 参数。或拆分长文本为多次请求。" },
  { code: "500", title: "Internal Server Error — 服务器内部错误", desc: "等待几秒后重试。如果持续出现，可能是模型服务故障。联系客服或查看服务状态。" },
  { code: "502", title: "Bad Gateway — 网关错误", desc: "模型服务暂时不可用。等待 30 秒后重试。可以切换到备用模型继续使用。" },
  { code: "503", title: "Service Unavailable — 服务暂不可用", desc: "模型正在维护或过载。稍等片刻后重试。可以临时切换到其他模型。" },
  { code: "504", title: "Gateway Timeout — 网关超时", desc: "模型服务响应过慢。增加客户端超时时间。或使用更快的模型。" },
  { code: "522", title: "Connection Timed Out — 连接超时", desc: "网络链路问题导致连接超时。检查本地网络连接。稍后重试。" },
  { code: "523", title: "Origin Unreachable — 模型服务不可达", desc: "模型服务商暂时不可达。该模型可能正在维护。建议切换到其他模型重试。" },
  { code: "524", title: "A Timeout Occurred — 超时", desc: "模型服务响应超时但未断开。可以重试，或降低 max_tokens。如持续出现，切换模型。" },
];

function ErrorCodesSection() {
  return (
    <section id="error-codes" className="help-section">
      <h2>常见 API 错误码</h2>
      <p className="help-section-desc">
        快速判断调用失败的原因。遇到错误码时，对照下面的说明来排查问题。
      </p>
      <div className="help-error-grid">
        {errorCodes.map((e) => (
          <div key={e.code} className="help-error-card">
            <div className="help-error-code">{e.code}</div>
            <div>
              <strong>{e.title}</strong>
              <p>{e.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ==================== Main Page ==================== */

export default function HelpPage() {
  const [customer, setCustomer] = useState(null);
  const [activeSection, setActiveSection] = useState("deepseek-guide");
  const [mobileTocOpen, setMobileTocOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("flowapi_customer");
    if (!stored) return;
    try {
      const c = JSON.parse(stored);
      queueMicrotask(() => setCustomer(c));
      fetch(`/api/customer?customerId=${c.id}`)
        .then((r) => r.ok && r.json())
        .then((data) => { if (data) { setCustomer(data); localStorage.setItem("flowapi_customer", JSON.stringify(data)); } })
        .catch(() => {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const hash = window.location.hash?.replace("#", "");
    if (hash) {
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveSection(hash);
      }, 400);
    }
  }, []);

  useEffect(() => {
    function onScroll() {
      for (const { id } of tocSections) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top < 200) setActiveSection(id);
        }
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
    setMobileTocOpen(false);
  }

  return (
    <>
      <Head>
        <title>帮助指南 - FlowAPI</title>
        <meta name="description" content="FlowAPI 帮助指南，包含 DeepSeek / ChatGPT 接入教程、配置参数、错误码排障等。" />
      </Head>

      <ConsoleLayout
        customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }}
        currentPath="/help"
        contentStyle={{ maxWidth: "none" }}
      >
        <div className="help-page">
          <button className="help-toc-toggle" onClick={() => setMobileTocOpen(!mobileTocOpen)}>
            {mobileTocOpen ? "关闭目录" : "目录"} {mobileTocOpen ? "×" : "☰"}
          </button>

          <aside className={`help-toc ${mobileTocOpen ? "open" : ""}`}>
            <div className="help-toc-title">帮助指南</div>
            <nav>
              {tocSections.map((s) => (
                <button
                  key={s.id}
                  className={`help-toc-link ${activeSection === s.id ? "active" : ""}`}
                  onClick={() => scrollToSection(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </nav>
          </aside>

          <div className="help-content">
            <DeepSeekGuideSection customer={customer} />
            <ChatGPTGuideSection customer={customer} />
            <ManualConfigSection customer={customer} />
            <PreflightCheckSection />
            <FailedCallChecklistSection />
            <ErrorCodesSection />
          </div>
        </div>
      </ConsoleLayout>
    </>
  );
}
