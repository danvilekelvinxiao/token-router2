import Head from "next/head";
import { useState } from "react";

const apiBaseUrl = "https://api.flowapi.fun/v1";
const demoApiKey = "customer_token_001";

const capabilities = [
  {
    label: "快速响应",
    value: "90%",
    detail: "请求 2 秒内返回首字",
    tag: "低延迟通道",
  },
  {
    label: "多模型统一调用",
    value: "1 Key",
    detail: "调用 GPT / Claude / DeepSeek / Qwen",
    tag: "OpenAI 兼容接口",
  },
  {
    label: "充值即用",
    value: "Token",
    detail: "人民币充值 Token，余额和成本实时可见",
    tag: "Token 余额",
  },
  {
    label: "傻瓜式接入",
    value: "3 步",
    detail: "复制 Base URL 和 API Key 即可接入",
    tag: "新手友好",
  },
];

const steps = [
  {
    number: "01",
    title: "注册账号",
    text: "完成注册后进入控制台，获得你的专属 API 接入环境。",
  },
  {
    number: "02",
    title: "创建令牌",
    text: "在控制台创建 API Key，支持多个令牌管理。",
  },
  {
    number: "03",
    title: "一键配置",
    text: "复制 Base URL 和 API Key，接入 OpenAI 兼容客户端、OpenClaw、Cline、Roo-Code、CC Switch。",
  },
];

const modelCards = [
  {
    name: "GPT",
    scene: "复杂分析 / 代码辅助 / 多语言任务",
    price: "均衡",
    speed: "稳定",
    score: "4.8",
  },
  {
    name: "Claude",
    scene: "长文分析 / 复杂推理 / 高质量写作",
    price: "成本较高",
    speed: "稳定",
    score: "5.0",
  },
  {
    name: "DeepSeek",
    scene: "中文内容 / 小红书 / 客服 / 日常写作",
    price: "低成本",
    speed: "速度快",
    score: "5.0",
  },
  {
    name: "Qwen",
    scene: "商务邮件 / 跨境开发信 / 办公总结",
    price: "低成本",
    speed: "中文优秀",
    score: "4.5",
  },
  {
    name: "Kimi",
    scene: "长文阅读 / 中文资料 / 知识整理",
    price: "中低成本",
    speed: "长文本强",
    score: "4.6",
  },
  {
    name: "GLM",
    scene: "办公问答 / 中文任务 / 轻量推理",
    price: "低成本",
    speed: "响应快",
    score: "4.4",
  },
  {
    name: "MiniMax",
    scene: "内容生成 / 多轮对话 / 角色场景",
    price: "灵活计费",
    speed: "体验好",
    score: "4.3",
  },
  {
    name: "Gemini",
    scene: "多模态理解 / 海外资料 / 信息提取",
    price: "均衡",
    speed: "稳定",
    score: "4.5",
  },
  {
    name: "Mistral",
    scene: "英文任务 / 轻量应用 / 自动化流程",
    price: "低成本",
    speed: "轻快",
    score: "4.2",
  },
];

const routeStrategies = [
  {
    title: "成本优先",
    text: "自动选择每 Token 成本最低的可用模型，适合日常文案、批量生成、客服回复。",
  },
  {
    title: "效果优先",
    text: "为关键任务匹配能力最强模型，适合复杂推理、重要文案、企业任务。",
  },
  {
    title: "均衡优先",
    text: "在成本和效果之间自动平衡，适合大多数用户默认选择。",
  },
  {
    title: "中文体验优先",
    text: "根据用户输入语言和任务场景，优先选择中文优化更好的模型。",
  },
];

const dashboardStats = [
  ["Token 余额", "¥ 2,860.40", "+18.6%"],
  ["今日调用次数", "18,420", "实时"],
  ["累计消耗", "¥ 749.82", "可导出"],
  ["平均响应速度", "1.42s", "首字"],
  ["调用成功率", "99.72%", "近 24h"],
  ["API Key 管理", "12 个", "分组权限"],
];

const logRows = [
  ["10:26:34", "deepseek-chat", "成功", "¥0.0038"],
  ["10:25:51", "claude-sonnet", "成功", "¥0.0412"],
  ["10:24:19", "qwen-plus", "成功", "¥0.0021"],
  ["10:23:07", "auto-router", "备用切换", "¥0.0064"],
];

const helpItems = [
  "最小请求示例",
  "Base URL 怎么填",
  "API Key 怎么复制",
  "Model 名称怎么选",
  "常见错误码",
];

const errorCodes = [
  ["401", "API Key 错误或余额不足"],
  ["403", "权限不足或分组不允许"],
  ["429", "请求过快"],
  ["400", "请求格式错误"],
  ["413", "请求体过大"],
  ["500", "上游模型错误"],
  ["502", "上游网关错误"],
  ["503", "服务不可用"],
  ["504", "上游超时"],
];

const pricing = [
  {
    name: "免费体验",
    price: "注册送 Token",
    text: "适合先测试模型效果、响应速度和接入流程。",
    points: ["网页端体验", "基础模型试用", "新手接入文档"],
  },
  {
    name: "个人版",
    price: "按量充值",
    text: "适合个人开发者、AI 工具玩家和轻度 API 用户。",
    points: ["人民币充值 Token", "调用日志", "模型广场"],
  },
  {
    name: "团队版",
    price: "团队余额池",
    text: "适合工作室、小团队、跨境电商、自媒体团队。",
    points: ["多 API Key 管理", "成本统计", "智能路由"],
  },
  {
    name: "企业版",
    price: "专属方案",
    text: "支持更高额度、独立通道、专属客服和企业级风控。",
    points: ["独立通道", "专属客服", "用量对账"],
  },
];

const codeExample = `curl https://api.flowapi.fun/v1/chat/completions \\
  -H "Authorization: Bearer sk-xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek/deepseek-chat",
    "messages": [
      {"role": "user", "content": "写一封跨境电商开发信"}
    ]
  }'`;

function HomePage() {
  const [prompt, setPrompt] = useState("用中文解释一下 FlowAPI 为什么适合新手接入 AI API。");
  const [chatResult, setChatResult] = useState("");
  const [chatStatus, setChatStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState("");

  async function copyText(label, value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("复制失败");
    }
  }

  async function runChatTest() {
    setLoading(true);
    setChatStatus("");
    setChatResult("");

    try {
      const response = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${demoApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "auto",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "模型体验暂时不可用");
      }

      setChatStatus(`已通过智能路由调用：${data.token_router?.routed_model || "auto"}`);
      setChatResult(data.choices?.[0]?.message?.content || "上游没有返回文本内容。");
    } catch (error) {
      setChatStatus(error.message || "模型体验暂时不可用");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>智流 FlowAPI - 中国 AI Token 调度平台</title>
        <meta
          name="description"
          content="智流 FlowAPI 是面向中国用户的 AI API 中转站，支持一个 API Key 调用多个大模型、人民币充值 Token、OpenAI 兼容接口和智能路由。"
        />
      </Head>

      <main className="site-shell">
        <header className="top-nav">
          <a className="brand" href="#home" aria-label="智流 FlowAPI">
            <span className="brand-mark">F</span>
            <span>
              <strong>智流</strong>
              <small>FlowAPI</small>
            </span>
          </a>

          <nav className="nav-links" aria-label="主导航">
            <a href="#home">首页</a>
            <a href="#console">控制台</a>
            <a href="#models">模型广场</a>
            <a href="#docs">帮助文档</a>
          </nav>

          <div className="nav-actions">
            <a className="ghost-link" href="#login">登录</a>
            <a className="ghost-link" href="#pricing">注册</a>
            <a className="solid-link" href="#console">控制台</a>
          </div>
        </header>

        <section className="hero-section" id="home">
          <div className="hero-copy">
            <div className="eyebrow">
              <span>AI API 中转站</span>
              <span>中国 AI Token 调度平台</span>
            </div>
            <h1>智流 FlowAPI</h1>
            <p className="hero-subtitle">一个 API Key，调用全球主流 AI 模型</p>
            <p className="hero-text">
              支持 GPT、Claude、DeepSeek、Qwen、Kimi、GLM 等模型统一接入。
              无需海外支付，无需复杂配置，充值 Token 即可使用。
            </p>
            <div className="hero-actions">
              <a className="primary-button" href="#quickstart">立即开始接入</a>
              <a className="secondary-button" href="#docs">查看帮助文档</a>
            </div>
            <div className="hero-keywords">
              <span>人民币充值 Token</span>
              <span>OpenAI 兼容接口</span>
              <span>成本优化</span>
              <span>调用日志</span>
            </div>
          </div>

          <div className="routing-board" aria-label="FlowAPI 接入面板">
            <div className="board-header">
              <span>OpenAI Compatible Endpoint</span>
              <strong>Live</strong>
            </div>
            <div className="endpoint-row">
              <span>Base URL</span>
              <code>{apiBaseUrl}</code>
              <button type="button" onClick={() => copyText("Base URL", apiBaseUrl)}>
                复制
              </button>
            </div>
            <div className="endpoint-row">
              <span>API Key</span>
              <code>Bearer sk-xxxx</code>
              <button type="button" onClick={() => copyText("API Key", "Bearer sk-xxxx")}>
                复制
              </button>
            </div>
            <div className="endpoint-row">
              <span>Model</span>
              <code>deepseek/deepseek-chat</code>
              <button type="button" onClick={() => copyText("Model", "deepseek/deepseek-chat")}>
                复制
              </button>
            </div>
            <div className="route-flow">
              <span>用户请求</span>
              <b />
              <span>智能路由</span>
              <b />
              <span>全球模型</span>
            </div>
            <div className="board-metrics">
              <div>
                <small>Token 余额</small>
                <strong>¥ 2,860.40</strong>
              </div>
              <div>
                <small>调用成功率</small>
                <strong>99.72%</strong>
              </div>
              <div>
                <small>平均响应</small>
                <strong>1.42s</strong>
              </div>
            </div>
            <p className="copy-state">{copied ? `${copied} 已复制` : "开发者可直接复制参数接入"}</p>
          </div>

          <div className="capability-grid">
            {capabilities.map((item) => (
              <article className="capability-card" key={item.label}>
                <span>{item.tag}</span>
                <strong>{item.value}</strong>
                <h3>{item.label}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section-block" id="quickstart">
          <div className="section-heading">
            <span>Quick Start</span>
            <h2>三步即可开始</h2>
            <p>不懂 API 也能照着走，开发者也能直接复制配置上线。</p>
          </div>
          <div className="steps-grid">
            {steps.map((step) => (
              <article className="step-card" key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section-block cc-section">
          <div className="section-heading">
            <span>Recommended</span>
            <h2>使用 CC Switch 一键配置</h2>
            <p>
              登录后进入控制台创建令牌，点击 CC Switch，即可自动填入 Base URL、模型和 API Key。
            </p>
          </div>
          <div className="config-layout">
            <div className="config-copy">
              <h3>如果工具不支持一键配置，也可以手动填写</h3>
              <p>
                OpenClaw / Cline / Roo-Code 兼容。复制下面三项，就能把 FlowAPI 接入到
                OpenAI 兼容客户端。
              </p>
            </div>
            <div className="config-list">
              <div>
                <span>Base URL</span>
                <code>{apiBaseUrl}</code>
              </div>
              <div>
                <span>Authorization</span>
                <code>Bearer sk-xxxx</code>
              </div>
              <div>
                <span>Model</span>
                <code>从模型广场复制模型名</code>
              </div>
            </div>
          </div>
        </section>

        <section className="section-block" id="models">
          <div className="section-heading compact-heading">
            <span>Model Hub</span>
            <h2>模型广场</h2>
            <p>一个 API Key 调用多个大模型，按任务选择更合适的模型。</p>
          </div>
          <div className="model-grid">
            {modelCards.map((model) => (
              <article className="model-card" key={model.name}>
                <div className="model-topline">
                  <h3>{model.name}</h3>
                  <span>推荐 {model.score} 星</span>
                </div>
                <p>{model.scene}</p>
                <div className="model-tags">
                  <span>{model.price}</span>
                  <span>{model.speed}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section-block route-section">
          <div className="section-heading">
            <span>Smart Router</span>
            <h2>自动选择最适合你的模型</h2>
            <p>智能路由根据成本、效果、语言和故障状态动态选择模型。</p>
          </div>
          <div className="route-grid">
            {routeStrategies.map((strategy) => (
              <article className="route-card" key={strategy.title}>
                <h3>{strategy.title}</h3>
                <p>{strategy.text}</p>
              </article>
            ))}
          </div>
          <div className="route-note">
            当模型超时、限流或故障时，系统自动切换备用模型，保障业务不中断。
          </div>
        </section>

        <section className="section-block" id="console">
          <div className="section-heading compact-heading">
            <span>Console</span>
            <h2>控制台展示</h2>
            <p>余额、用量、成本、调用日志和 API Key 管理集中在一个后台。</p>
          </div>
          <div className="console-layout">
            <div className="stats-grid">
              {dashboardStats.map(([label, value, meta]) => (
                <article className="stat-card" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{meta}</small>
                </article>
              ))}
            </div>
            <div className="console-panel">
              <div className="panel-title">
                <h3>模型消耗分布</h3>
                <span>今日</span>
              </div>
              <div className="usage-bars">
                <div style={{ "--bar": "72%" }}>
                  <span>DeepSeek</span>
                  <b />
                  <em>72%</em>
                </div>
                <div style={{ "--bar": "48%" }}>
                  <span>Qwen</span>
                  <b />
                  <em>48%</em>
                </div>
                <div style={{ "--bar": "31%" }}>
                  <span>Claude</span>
                  <b />
                  <em>31%</em>
                </div>
              </div>
            </div>
            <div className="console-panel log-panel">
              <div className="panel-title">
                <h3>调用日志</h3>
                <span>实时</span>
              </div>
              {logRows.map(([time, model, status, cost]) => (
                <div className="log-row" key={`${time}-${model}`}>
                  <span>{time}</span>
                  <strong>{model}</strong>
                  <em>{status}</em>
                  <b>{cost}</b>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section-block docs-section" id="docs">
          <div className="section-heading">
            <span>Docs</span>
            <h2>不会 API 也能接入</h2>
            <p>把开发者真正需要复制的内容放在最明显的位置。</p>
          </div>
          <div className="docs-layout">
            <div className="help-list">
              {helpItems.map((item) => (
                <a href="#docs" key={item}>
                  {item}
                </a>
              ))}
            </div>
            <pre className="code-block">{codeExample}</pre>
          </div>
          <div className="error-grid">
            {errorCodes.map(([code, text]) => (
              <article className="error-card" key={code}>
                <strong>{code}</strong>
                <span>{text}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="section-block chat-section" id="login">
          <div className="section-heading compact-heading">
            <span>Web Chat</span>
            <h2>网页端聊天只是体验入口</h2>
            <p>
              不想配置 API？可以先在网页端体验模型效果。网页聊天用于模型测试、响应速度体验和付费前试用。
            </p>
          </div>
          <div className="chat-box">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              aria-label="网页端模型体验输入"
            />
            <div className="chat-actions">
              <button type="button" onClick={runChatTest} disabled={loading}>
                {loading ? "正在体验模型..." : "体验智能路由"}
              </button>
              <span>{chatStatus || "使用演示 API Key 发起一次模型测试"}</span>
            </div>
            {chatResult && <div className="chat-result">{chatResult}</div>}
          </div>
        </section>

        <section className="section-block pricing-section" id="pricing">
          <div className="section-heading compact-heading">
            <span>Pricing</span>
            <h2>价格套餐</h2>
            <p>从免费体验到企业专线，用 Token 余额把成本讲清楚。</p>
          </div>
          <div className="pricing-grid">
            {pricing.map((plan) => (
              <article className="price-card" key={plan.name}>
                <h3>{plan.name}</h3>
                <strong>{plan.price}</strong>
                <p>{plan.text}</p>
                <ul>
                  {plan.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <footer className="site-footer">
          <strong>智流 FlowAPI</strong>
          <span>flowapi.fun</span>
          <span>AI API 中转 + Token 充值 + 多模型统一调用 + 新手极简接入</span>
        </footer>
      </main>
    </>
  );
}

export default HomePage;
