import Head from "next/head";
import Link from "next/link";

const sections = [
  {
    num: "一",
    title: "我们收集哪些信息",
    content: [
      "当您注册 FlowAPI 账号时，我们需要收集您的电子邮箱地址和您设置的登录密码。您还可以选择填写邀请码以获取奖励额度。",
      "当您使用 API 调用服务时，我们会收集 API 请求相关的必要信息，包括请求时间、模型名称、Token 用量、响应状态、IP 地址等。",
      "当您进行充值和支付时，我们会记录交易金额、支付方式、订单编号及交易状态。如果您使用淘宝激活码兑换，我们会记录激活码和兑换记录。",
    ],
  },
  {
    num: "二",
    title: "我们如何使用信息",
    content: [
      "为您提供 FlowAPI 的核心服务：账号注册与管理、AI API 接入与转发、Token 额度管理、调用统计与计费。",
      "保障平台安全：进行安全风控、异常检测、防刷防攻击、密钥泄露预警。",
      "改善服务质量：分析服务使用情况、排查故障、优化性能和用户体验。",
      "履行法律义务：按照法律法规和监管要求进行数据留存和合规处理。",
      "发送服务通知：包括余额变动提醒、套餐到期提醒、重要功能更新和安全提醒。",
    ],
  },
  {
    num: "三",
    title: "API 请求与调用数据",
    content: [
      "FlowAPI 是一个 AI API 中转平台，您的 API 请求会通过我们的服务转发至上游 AI 服务提供商。为完成 API 转发、统计 Token 用量和计费，我们会在必要范围内处理您的 API 请求数据和响应状态信息。",
      "我们不使用您的 API 输入和输出内容进行模型训练，也不将其用于本协议约定之外的其他商业目的，法律法规另有要求的除外。",
      "API 请求数据会在满足服务提供、计费结算和安全风控的最短必要期限内保留，超出期限后将按照数据清理策略进行删除或匿名化处理。",
    ],
  },
  {
    num: "四",
    title: "Cookie 与设备信息",
    content: [
      "我们会在您的浏览器中设置必要的 Cookie，用于维持登录会话、记住主题偏好（深色 / 浅色模式）、保护账户安全。您可以在浏览器设置中管理或清除 Cookie，但这可能影响部分功能的正常使用。",
      "为保障服务安全，我们可能会收集设备标识符、浏览器类型、操作系统版本、网络信息等必要的设备特征信息用于安全风控。",
    ],
  },
  {
    num: "五",
    title: "数据安全",
    content: [
      "我们采用行业标准的安全技术和管理措施保护您的个人信息，包括但不限于数据传输加密（TLS/HTTPS）、密码哈希存储、API Key 完整值展示、访问权限控制和操作日志审计。",
      "尽管我们采取了合理的安全措施，但互联网上的数据传输和存储没有绝对安全。请您也妥善保管您的账号密码和 API Key，不要将其分享给任何第三方。",
    ],
  },
  {
    num: "六",
    title: "第三方服务",
    content: [
      "我们的服务依赖于第三方 AI 服务提供商来提供底层模型能力。当您通过 FlowAPI 调用模型时，您的请求内容会被转发至相应的上游服务提供商，该等提供商的数据处理行为受其自身的隐私政策约束。",
      "我们可能与第三方支付服务商合作，为您提供充值支付功能。支付过程中产生的相关信息将由支付服务商直接收集和处理。",
      "除上述必要的服务依赖外，我们不会将您的个人信息出售、出租或分享给任何第三方用于其自身的营销目的。",
    ],
  },
  {
    num: "七",
    title: "用户权利",
    content: [
      "您有权访问、更正您的个人账号信息。您可以在个人资料页面查看和编辑姓名、联系方式等信息。",
      "您有权要求删除您的账号。您可以通过平台提供的联系方式申请注销账号，我们将在合理期限内处理您的请求。注销后，我们将在法律要求的期限内保留必要的注册数据和交易记录。",
      "您有权撤回对 Cookie 的同意。您可以在浏览器设置中选择不接受 Cookie，但这可能导致部分功能无法正常使用。",
      "如果您对我们的数据处理有任何疑问、意见或投诉，请通过产品界面的「联系我们」入口与我们联系。",
    ],
  },
  {
    num: "八",
    title: "联系我们",
    content: [
      "如果您对本隐私政策或个人信息保护有任何疑问、意见或建议，请通过 FlowAPI 平台提供的联系方式与我们联系。我们将在收到您的反馈后及时核实和处理。",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <Head>
        <title>FlowAPI 隐私政策</title>
        <meta name="description" content="FlowAPI 隐私政策 - 了解我们如何收集、使用和保护您的个人信息。" />
      </Head>

      <main className="landing-shell" style={{ minHeight: "100vh", padding: "40px 24px 80px" }}>
        <div className="terms-page-container">
          <div className="terms-page-header">
            <p className="terms-page-updated">更新日期：2026年1月1日 · 生效日期：2026年1月1日</p>
            <h1>FlowAPI 隐私政策</h1>
            <div className="terms-page-intro">
              <p>
                FlowAPI 平台（以下简称&ldquo;我们&rdquo;或&ldquo;FlowAPI&rdquo;）深知个人信息对您的重要性。本隐私政策旨在向您说明我们如何收集、使用、存储和保护您的个人信息，以及您享有的相关权利。请您在使用 FlowAPI 服务前仔细阅读本隐私政策。
              </p>
              <p>
                本隐私政策与您使用的 FlowAPI 服务密切相关。如您对本隐私政策有任何疑问，请通过平台提供的联系方式与我们联系。
              </p>
            </div>
          </div>

          <div className="terms-page-body">
            {sections.map((section) => (
              <section key={section.num} className="terms-section">
                <h2>
                  {section.num}、{section.title}
                </h2>
                {section.content.map((p, i) => (
                  <p key={i}>
                    {section.num}.{i + 1} {p}
                  </p>
                ))}
              </section>
            ))}
          </div>

          <div className="terms-page-footer">
            <Link href="/register" className="btn-primary">返回注册</Link>
            <button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回上一页</button>
          </div>
        </div>
      </main>
    </>
  );
}
