import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import { getPublicApiBaseUrl } from "@/lib/public-api";

export default function ImageHelpPage() {
  const [customer] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("flowapi_customer");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const apiBase = getPublicApiBaseUrl();
  const apiKey = customer?.apiKeys?.[0]?.token || "";

  return (
    <>
      <Head><title>生成图片使用指南 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }} currentPath="/help">
        <main className="image-help-page">
          <section className="image-history-head">
            <div>
              <span>Image Guide</span>
              <h1>生成图片使用指南</h1>
              <p>不需要知道任何上游平台是什么，也不需要研究图片接口。你只需要注册、充值、输入需求、点击发送。</p>
            </div>
          </section>

          <section className="image-help-grid">
            <article>
              <h2>1. 如何直接在网页生成图片</h2>
              <p>进入 <Link href="/images">生成图片</Link>，输入一句话就能直接生成。比如：帮我做一张黑金科技风的 AI 海报。</p>
            </article>
            <article>
              <h2>2. 如何上传图片后改图</h2>
              <p>上传商品图、人物图、海报草图后，再补一句修改要求。比如：保留主体，背景换成白底电商主图。</p>
            </article>
            <article>
              <h2>3. 如何切换模型</h2>
              <p>在输入框上方切换模型即可。前台只显示适合小白的名称和标签，不需要理解技术参数。</p>
            </article>
            <article>
              <h2>4. 如何看每次消耗</h2>
              <p>生成前会显示预计消耗，生成成功后顶部会出现灵动岛式扣费提示：-xx Token / -￥xx。</p>
            </article>
            <article>
              <h2>5. 如何查看自己的日志</h2>
              <p>进入 <Link href="/dashboard/logs">使用日志</Link> 或 <Link href="/images/history">图片历史</Link>，可以查看请求 ID、模型、输出张数、扣费和状态。</p>
            </article>
            <article>
              <h2>6. 队长如何看团队成员用了多少</h2>
              <p>进入 <Link href="/team/billing">团队记账</Link>，队长 / 管理员可以看团队总消耗和每个成员分别花了多少。</p>
            </article>
            <article>
              <h2>7. 如何通过 API 调用</h2>
              <p>文生图：`POST {apiBase}/images/generations`。图生图：`POST {apiBase}/images/edits`。使用你自己的 FlowAPI API Key 即可。</p>
            </article>
            <article>
              <h2>8. 如何通过 cc-switch 转接</h2>
              <p>Base URL 只填 FlowAPI 对外地址，API Key 只填你自己的 FlowAPI Key，Model 选择你在模型广场看到的模型名即可。整个接入过程不需要知道任何上游平台名字。</p>
            </article>
            <article>
              <h2>9. 常见错误说明</h2>
              <p>余额不足、图片过大、图片格式错误、内容审核失败、模型服务超时，都会在页面上给出友好提示和请求 ID。</p>
            </article>
            <article>
              <h2>10. 失败为什么不扣费</h2>
              <p>系统会先做余额校验，失败后自动退回预占额度，所以你看到的结果会是“生成失败，未扣费”。</p>
            </article>
            <article>
              <h2>11. 请求 ID 如何提交客服排查</h2>
              <p>在日志页或结果卡片里复制请求 ID，直接发给客服即可。客服可以按请求 ID 查询模型、状态和失败原因。</p>
            </article>
          </section>

          <section className="image-help-api-box">
            <h2>cc-switch / API 接入参数</h2>
            <div className="image-help-api-grid">
              <article><span>Base URL</span><code>{apiBase}</code></article>
              <article><span>API Key</span><code>{apiKey || "先去 API 管理创建你的 Key"}</code></article>
              <article><span>推荐模型</span><code>flowapi-seedream-45</code></article>
            </div>
          </section>
        </main>
      </ConsoleLayout>
    </>
  );
}
