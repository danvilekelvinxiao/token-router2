import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import CardDetailModal, { DetailRows, DetailTable } from "@/components/CardDetailModal";

const amounts = [
  { value: 20, label: "¥20", desc: "体验测试" },
  { value: 50, label: "¥50", desc: "轻度使用" },
  { value: 100, label: "¥100", desc: "推荐入门" },
  { value: 200, label: "¥200", desc: "开发常用" },
  { value: 500, label: "¥500", desc: "团队测试" },
  { value: 1000, label: "¥1,000", desc: "大额充值" },
];

const paymentMethods = [
  { key: "wechat", name: "微信支付", icon: "WX", color: "#07c160", bg: "#f0fdf4" },
  { key: "alipay", name: "支付宝", icon: "ALI", color: "#1677ff", bg: "#eff6ff" },
  { key: "taobao_code", name: "淘宝激活码", icon: "TB", color: "#f97316", bg: "#fff7ed", imageSrc: "/images/pay/taobao.jpg" },
];

const addOnServices = [
  {
    id: "account_setup_assistance",
    title: "Codex / ChatGPT 手机号验证",
    priceCny: 20,
    unit: "次",
    description: "提供海外手机号验证支持，协助完成 Codex / ChatGPT 账号注册中的手机号验证步骤。一次购买，永久绑定。",
    tags: ["手机号验证", "一次购买", "永久绑定"],
    type: "fixed",
  },
  {
    id: "plus_monthly_guidance",
    title: "官方 ChatGPT Plus 激活",
    priceCny: 140,
    unit: "月",
    description: "提供 ChatGPT Plus 官方订阅激活协助，包含账号注册、支付方式指导和使用建议。按月订阅，适合长期使用用户。",
    tags: ["月套餐", "官方激活", "长期使用"],
    type: "fixed",
  },
  {
    id: "openrouter_credits",
    title: "OpenRouter Credits 代充",
    priceCny: 9,
    unit: "credits",
    minQuantity: 5,
    description: "适合需要使用 OpenRouter 官方 credits 的用户，最低 5 credits 起充。",
    tags: ["最低 5 个", "适合开发者", "额度代充"],
    type: "quantity",
  },
];

const paymentQrImages = {
  wechat: "/images/pay/wechat.jpg",
  alipay: "/images/pay/alipay.jpg",
  taobao_code: "/images/pay/taobao.jpg",
};

const weeklyPackages = [
  { id: "cell_50", code: "CELL-50", name: "点火测试", scene: "低成本验证", price: 12, quotaText: "50 万", quotaTokens: 500000, validDays: 7, unitPrice: "0.24 元 / 万", tag: "试用", highlight: false, benefits: ["有效期：7 天", "单价：0.24 元 / 万", "可叠加购买", "优先消耗最早到期权益"] },
  { id: "drive_100", code: "DRIVE-100", name: "日常推进", scene: "日常 Coding", price: 24, quotaText: "100 万", quotaTokens: 1000000, validDays: 7, unitPrice: "0.24 元 / 万", tag: "常用", highlight: true, benefits: ["有效期：7 天", "单价：0.24 元 / 万", "可叠加购买", "优先消耗最早到期权益"] },
  { id: "orbit_200", code: "ORBIT-200", name: "高频航段", scene: "高频自动化", price: 45, quotaText: "200 万", quotaTokens: 2000000, validDays: 7, unitPrice: "0.23 元 / 万", tag: "高频", highlight: false, benefits: ["有效期：7 天", "单价：0.23 元 / 万", "可叠加购买", "优先消耗最早到期权益"] },
  { id: "core_500", code: "CORE-500", name: "主推燃料舱", scene: "长程主力", price: 108, quotaText: "500 万", quotaTokens: 5000000, validDays: 7, unitPrice: "0.22 元 / 万", tag: "主推", highlight: true, featured: true, benefits: ["有效期：7 天", "单价：0.22 元 / 万", "可叠加购买", "优先消耗最早到期权益"] },
];

const monthlyPackages = [
  { id: "monthly_probe", name: "前进一：探测", quotaText: "每日 10 万 / 月共 300 万", price: 30, validDays: 30, unitPrice: "0.10 元 / 万", totalValue: "¥72.00", plusEquivalent: "约等于 1 个 Plus", recommended: false, benefits: ["有效期：30 天", "单价：0.10 元 / 万", "额度重置：每天", "总额度：¥72.00", "约等于 1 个 Plus"] },
  { id: "monthly_launch", name: "前进二：启航", quotaText: "每日 30 万 / 月共 900 万", price: 98, validDays: 30, unitPrice: "0.11 元 / 万", totalValue: "¥216.00", plusEquivalent: "约等于 2 个 Plus", recommended: false, benefits: ["有效期：30 天", "单价：0.11 元 / 万", "额度重置：每天", "总额度：¥216.00", "约等于 2 个 Plus"] },
  { id: "monthly_cruise", name: "前进三：巡航", quotaText: "每日 50 万 / 月共 1500 万", price: 168, validDays: 30, unitPrice: "0.11 元 / 万", totalValue: "¥360.00", plusEquivalent: "约等于 3.5 个 Plus", recommended: true, benefits: ["有效期：30 天", "单价：0.11 元 / 万", "额度重置：每天", "总额度：¥360.00", "约等于 3.5 个 Plus"] },
];

const rechargeTrustItems = [
  { title: "自动到账优先", desc: "微信 / 支付宝商户通道可用时，支付成功后自动更新余额。" },
  { title: "订单全程可追踪", desc: "每笔充值都会生成订单状态，异常时方便核对和处理。" },
  { title: "淘宝激活码兜底", desc: "扫码不方便时，可通过淘宝购买激活码并自动充入当前账户。" },
  { title: "余额实时刷新", desc: "到账后余额会同步更新，API 调用不会因为等待确认而中断太久。" },
];

const TAOBAO_SHOP_URL = "https://e.tb.cn/h.R0y11RtMIOB7A40?tk=P4j75IXMHgi";

const statusMap = {
  pending: { label: "待确认", color: "#f59e0b", bg: "#fffbeb" },
  approved: { label: "已到账", color: "#16a34a", bg: "#f0fdf4" },
  rejected: { label: "未通过", color: "#ef4444", bg: "#fef2f2" },
};

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatMoney(value) {
  return `¥ ${Number(value || 0).toFixed(2)}`;
}

function getPaymentPayload({ customerId, amount, paymentMethod, purchaseType, pkg, paymentRef = "" }) {
  return { customerId, amount, paymentMethod, purchaseType, packageId: pkg?.id || "", packageName: pkg ? `${pkg.name}${pkg.code ? ` ${pkg.code}` : ""}` : "", quotaText: pkg?.quotaText || "", validDays: pkg?.validDays || null, paymentRef };
}

/* ==================== Main Page ==================== */

export default function RechargePage() {
  const router = useRouter();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [purchaseType, setPurchaseType] = useState("balance_recharge");
  const [selectedAmount, setSelectedAmount] = useState(100);
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [customAmount, setCustomAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("wechat");
  const [paymentRef, setPaymentRef] = useState("");
  const [step, setStep] = useState("choose");
  const [copied, setCopied] = useState("");
  const [paying, setPaying] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState(null);
  const [paymentSession, setPaymentSession] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [manualFallback, setManualFallback] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState(null);
  const [packageDetail, setPackageDetail] = useState(null);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [openrouterCredits, setOpenrouterCredits] = useState(5);
  const [referral, setReferral] = useState(null);
  const [commissionModal, setCommissionModal] = useState("");
  const [commissionForm, setCommissionForm] = useState({ amountCny: "", method: "alipay", account: "", realName: "", remark: "" });
  const [commissionMessage, setCommissionMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = localStorage.getItem("flowapi_customer");
      if (!stored) { router.push("/login"); return; }
      let c;
      try { c = JSON.parse(stored); } catch { router.push("/login"); return; }
      setCustomer(c);
      refreshCustomer(c);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router]);

  async function refreshCustomer(c) {
    const res = await fetch(`/api/customer?customerId=${c.id}`);
    if (res.ok) {
      const data = await res.json();
      setCustomer(data);
      localStorage.setItem("flowapi_customer", JSON.stringify(data));
      const primaryKey = data.apiKeys?.[0];
      if (primaryKey?.newApiId) {
        fetch("/api/newapi/quota/recharge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokenId: primaryKey.newApiId, quota: Number(data.balance || 0) * 10000 }) }).catch(() => {});
      }
    }
    const orderRes = await fetch(`/api/recharge?customerId=${c.id}`);
    if (orderRes.ok) { const data = await orderRes.json(); setOrders(data.orders || []); }
    const referralRes = await fetch(`/api/referrals/me?customerId=${c.id}`);
    if (referralRes.ok) setReferral(await referralRes.json());
  }

  useEffect(() => {
    if (step !== "pay" || paymentMethod === "taobao_code" || manualFallback || !submittedOrder?.id || submittedOrder.status === "approved") return undefined;
    const timer = window.setInterval(async () => {
      const res = await fetch(`/api/recharge?orderId=${submittedOrder.id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.order) return;
      setSubmittedOrder(data.order);
      if (data.order.status === "approved" && customer) refreshCustomer(customer);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [customer, manualFallback, paymentMethod, step, submittedOrder]);

  /* ---------- Computed ---------- */

  const selectedWeeklyPackage = useMemo(() => weeklyPackages.find((item) => item.id === selectedPackageId) || null, [selectedPackageId]);
  const selectedMonthlyPackage = useMemo(() => monthlyPackages.find((item) => item.id === selectedPackageId) || null, [selectedPackageId]);
  const selectedPackage = purchaseType === "weekly_package" ? selectedWeeklyPackage : purchaseType === "monthly_subscription" ? selectedMonthlyPackage : null;
  const selectedRechargeAmount = selectedAmount || Number(customAmount) || 0;
  const baseAmount = purchaseType === "balance_recharge" ? selectedRechargeAmount : Number(selectedPackage?.price || 0);

  // Add-on calculations
  const addOnTotal = useMemo(() => {
    return selectedAddOns.reduce((sum, addonId) => {
      const svc = addOnServices.find((s) => s.id === addonId);
      if (!svc) return sum;
      if (svc.type === "quantity") return sum + svc.priceCny * openrouterCredits;
      return sum + svc.priceCny;
    }, 0);
  }, [selectedAddOns, openrouterCredits]);

  const finalAmount = baseAmount + addOnTotal;

  const currentMethod = useMemo(() => paymentMethods.find((item) => item.key === paymentMethod) || paymentMethods[0], [paymentMethod]);

  const selectedAddOnDetails = useMemo(() => {
    return selectedAddOns.map((id) => {
      const svc = addOnServices.find((s) => s.id === id);
      if (!svc) return null;
      if (svc.type === "quantity" && svc.id === "openrouter_credits") {
        return { ...svc, quantity: openrouterCredits, total: svc.priceCny * openrouterCredits };
      }
      return { ...svc, total: svc.priceCny };
    }).filter(Boolean);
  }, [selectedAddOns, openrouterCredits]);

  const orderSummary = useMemo(() => {
    let summary = { typeLabel: "余额充值", packageName: "", quotaLabel: "", quotaValue: "", validDays: null, amount: baseAmount };
    if (purchaseType === "weekly_package" && selectedPackage) {
      summary = { typeLabel: "周畅用包", packageName: `${selectedPackage.name} ${selectedPackage.code}`, quotaLabel: "获得额度", quotaValue: `${selectedPackage.quotaText} Token`, validDays: selectedPackage.validDays, amount: selectedPackage.price };
    } else if (purchaseType === "monthly_subscription" && selectedPackage) {
      summary = { typeLabel: "月卡套餐", packageName: selectedPackage.name, quotaLabel: "每日额度 / 月总额度", quotaValue: `${selectedPackage.quotaText} Token`, validDays: selectedPackage.validDays, amount: selectedPackage.price };
    }
    return summary;
  }, [purchaseType, selectedPackage, baseAmount]);

  /* ---------- Handlers ---------- */

  function selectRechargeAmount(amount) { setPurchaseType("balance_recharge"); setSelectedAmount(amount); setSelectedPackageId(null); setCustomAmount(""); }
  function selectCustomRechargeAmount(value) { setPurchaseType("balance_recharge"); setCustomAmount(value); setSelectedAmount(null); setSelectedPackageId(null); }
  function selectPackage(type, packageId) { setPurchaseType(type); setSelectedPackageId(packageId); setSelectedAmount(null); setCustomAmount(""); }

  function toggleAddOn(id) {
    setSelectedAddOns((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function handleSubmit() {
    if (finalAmount <= 0) return;
    setStep("pay");
    setSubmittedOrder(null);
    setPaymentSession(null);
    setPaymentError("");
    setManualFallback(false);
    const payload = getPaymentPayload({ customerId: customer?.id, amount: finalAmount, paymentMethod, purchaseType, pkg: selectedPackage });
    if (paymentMethod === "taobao_code" || !customer) {
      if (customer && purchaseType !== "balance_recharge") {
        try {
          const res = await fetch("/api/recharge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          const data = await res.json();
          if (res.ok && data.order) { setSubmittedOrder(data.order); setOrders((prev) => [data.order, ...prev]); }
        } catch { setPaymentError("套餐订单创建失败，请稍后再试"); }
      }
      return;
    }
    setPaying(true);
    try {
      const res = await fetch("/api/recharge/create-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok && data.mode === "manual") { setManualFallback(true); setPaymentError(data.reason || ""); }
      else if (!res.ok) { setPaymentError(data.error || "支付订单生成失败"); }
      else { setSubmittedOrder(data.order); setPaymentSession(data.payment); }
    } catch { setPaymentError("网络异常，请稍后再试"); }
    setPaying(false);
  }

  async function confirmPayment() {
    if (!customer || finalAmount <= 0) return;
    const payload = getPaymentPayload({ customerId: customer.id, amount: finalAmount, paymentMethod, purchaseType, pkg: selectedPackage, paymentRef });
    setPaying(true);
    try {
      const res = await fetch("/api/recharge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok && data.order) { setSubmittedOrder(data.order); setOrders((prev) => [data.order, ...prev]); setPaymentRef(""); }
      else { alert(data.error || "提交失败，请稍后再试"); }
    } catch { alert("网络异常，请稍后再试"); }
    setPaying(false);
  }

  async function redeemCode() {
    if (!customer || !activationCode.trim() || redeeming) return;
    setRedeeming(true);
    setRedeemResult(null);
    try {
      const res = await fetch("/api/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: activationCode.trim(), customerId: customer.id }) });
      const data = await res.json();
      if (res.ok && data.success) { setRedeemResult(data); setCustomer(data.customer); localStorage.setItem("flowapi_customer", JSON.stringify(data.customer)); }
      else { setRedeemResult({ success: false, error: data.error || "激活失败，请检查激活码" }); }
    } catch { setRedeemResult({ success: false, error: "网络异常，请稍后再试" }); }
    setRedeeming(false);
  }

  async function copyText(text) { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(""), 1500); }

  async function submitCommissionAction(event) {
    event.preventDefault();
    setCommissionMessage("");
    const endpoint = commissionModal === "convert" ? "/api/referrals/commission/convert" : "/api/referrals/withdraw";
    const payload = commissionModal === "convert"
      ? { amountCny: Number(commissionForm.amountCny) }
      : {
          amountCny: Number(commissionForm.amountCny),
          method: commissionForm.method,
          account: commissionForm.account,
          realName: commissionForm.realName,
          remark: commissionForm.remark,
        };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setCommissionMessage(data.error || "操作失败，请稍后重试");
      return;
    }
    setCommissionMessage(commissionModal === "convert" ? `已成功使用 ¥${Number(payload.amountCny).toFixed(2)} 佣金兑换 FlowAPI 余额。` : "已提交提现申请，管理员审核后会处理。");
    setCommissionForm({ amountCny: "", method: "alipay", account: "", realName: "", remark: "" });
    refreshCustomer(customer);
  }

  if (!customer) {
    return (
      <main className="landing-shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--page-sub)" }}>加载中...</p>
      </main>
    );
  }

  /* ==================== Render ==================== */

  return (
    <>
      <Head><title>充值 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer} currentPath="/recharge">
        {/* Page header */}
        <div className="recharge-page-header">
          <div>
            <span className="recharge-page-kicker">资产管理</span>
            <h1>充值 Token</h1>
            <p>当前余额 <strong>¥ {Number(customer.balance).toFixed(2)}</strong></p>
          </div>
          <div className="recharge-page-badges">
            <span>人民币充值</span><span>套餐可选</span><span>异常订单人工兜底</span>
          </div>
        </div>

        {step === "choose" ? (
          <div className="recharge-layout">

            {/* ===== LEFT: Main area ===== */}
            <section className="recharge-main">

              {/* 1. Recharge amount */}
              <div className="recharge-section-card">
                <div className="section-heading-row">
                  <div><h2>充值金额</h2><p>选择预设金额或输入自定义金额。</p></div>
                </div>
                <div className="recharge-amount-grid">
                  {amounts.map((item) => (
                    <button key={item.value} type="button" className={`recharge-amount-card ${purchaseType === "balance_recharge" && selectedAmount === item.value ? "selected" : ""}`} onClick={() => selectRechargeAmount(item.value)}>
                      <strong>{item.label}</strong><span>{item.desc}</span>
                    </button>
                  ))}
                </div>
                <label className="recharge-custom-input">
                  <span>自定义金额</span>
                  <input type="number" min="1" placeholder="输入充值金额" value={customAmount} onChange={(event) => selectCustomRechargeAmount(event.target.value)} />
                </label>
              </div>

              {/* 2. Add-on services */}
              <div className="recharge-section-card">
                <div className="section-heading-row">
                  <div>
                    <h2>附加服务</h2>
                    <p>可选增值服务，适合需要人工协助、订阅支持、额度代充或接入配置的用户。</p>
                  </div>
                </div>
                <div className="addon-services-grid">
                  {addOnServices.map((svc) => {
                    const isSelected = selectedAddOns.includes(svc.id);
                    const isQuantity = svc.type === "quantity" && svc.id === "openrouter_credits";
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        className={`addon-service-card ${isSelected ? "selected" : ""}`}
                        onClick={() => toggleAddOn(svc.id)}
                      >
                        <div className="addon-service-head">
                          <strong>{svc.title}</strong>
                          <span className="addon-service-price">¥{svc.priceCny}{svc.type === "quantity" ? ` / ${svc.unit}` : ` / ${svc.unit}`}</span>
                        </div>
                        <p>{svc.description}</p>
                        <div className="addon-service-tags">
                          {svc.tags.map((tag) => <span key={tag}>{tag}</span>)}
                        </div>
                        {isSelected && isQuantity && (
                          <div className="addon-service-quantity" onClick={(e) => e.stopPropagation()}>
                            <span>OpenRouter Credits 数量</span>
                            <div className="addon-quantity-control">
                              <button type="button" onClick={() => setOpenrouterCredits((v) => Math.max(5, v - 1))} disabled={openrouterCredits <= 5}>−</button>
                              <strong>{openrouterCredits}</strong>
                              <button type="button" onClick={() => setOpenrouterCredits((v) => v + 1)}>+</button>
                            </div>
                            <span className="addon-quantity-total">合计 ¥{svc.priceCny * openrouterCredits}</span>
                          </div>
                        )}
                        <span className={`addon-service-action ${isSelected ? "selected" : ""}`}>
                          {isSelected ? "已选择" : "选择服务"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Codex API weekly packages */}
              <div className="recharge-section-card">
                <div className="section-heading-row">
                  <div><h2>Codex API — 周畅用包</h2><p>点击档位后生成订单，支付后自动或人工确认开通对应额度包。</p></div>
                  <span>支付宝直购 · 一周畅用</span>
                </div>
                <div className="recharge-package-grid weekly">
                  {weeklyPackages.map((pkg) => (
                    <PackageCard key={pkg.id} pkg={pkg} type="weekly_package" selected={purchaseType === "weekly_package" && selectedPackageId === pkg.id} onSelect={() => selectPackage("weekly_package", pkg.id)} onDetail={() => setPackageDetail(buildPackageDetail(pkg, "weekly_package"))} />
                  ))}
                </div>
              </div>

              {/* 4. Monthly packages */}
              <div className="recharge-section-card">
                <div className="section-heading-row">
                  <div><h2>月卡套餐</h2><p>购买区独立展示，已购权益以上方“我的订阅”为准。</p></div>
                  <span>每日额度 · 月度资源包</span>
                </div>
                <div className="recharge-package-grid monthly">
                  {monthlyPackages.map((pkg) => (
                    <PackageCard key={pkg.id} pkg={pkg} type="monthly_subscription" selected={purchaseType === "monthly_subscription" && selectedPackageId === pkg.id} onSelect={() => selectPackage("monthly_subscription", pkg.id)} onDetail={() => setPackageDetail(buildPackageDetail(pkg, "monthly_subscription"))} />
                  ))}
                </div>
              </div>

            </section>

            {/* ===== RIGHT: Order sidebar ===== */}
            <aside className="recharge-sidebar">
              <CommissionAssetCard
                referral={referral}
                onConvert={() => { setCommissionModal("convert"); setCommissionMessage(""); }}
                onWithdraw={() => { setCommissionModal("withdraw"); setCommissionMessage(""); }}
              />

              {/* Order summary */}
              <div className="recharge-summary-card">
                <h2>订单摘要</h2>
                <div className="summary-rows">
                  <Row label="订单类型" value={orderSummary.typeLabel} />
                  {orderSummary.packageName ? <Row label="套餐名称" value={orderSummary.packageName} /> : null}
                  {orderSummary.quotaValue ? <Row label={orderSummary.quotaLabel} value={orderSummary.quotaValue} /> : null}
                  {orderSummary.validDays ? <Row label="有效期" value={`${orderSummary.validDays} 天`} /> : null}
                  <Row label={purchaseType === "balance_recharge" ? "充值金额" : "套餐价格"} value={formatMoney(baseAmount)} strong />

                  {selectedAddOnDetails.length > 0 && (
                    <div className="summary-addons">
                      <div className="summary-addons-label">附加服务</div>
                      {selectedAddOnDetails.map((svc) => (
                        <div key={svc.id} className="summary-addon-row">
                          <span>{svc.title}{svc.quantity ? ` ${svc.quantity} ${svc.unit}` : ""}</span>
                          <span>¥{svc.total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="summary-divider" />
                  <Row label="应付金额" value={formatMoney(finalAmount)} strong />
                </div>
              </div>

              {/* Payment method */}
              <div className="recharge-summary-card">
                <h2>支付方式</h2>
                <div className="payment-method-sidebar-grid">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.key}
                      type="button"
                      className={`payment-method-sidebar-card ${paymentMethod === method.key ? "selected" : ""}`}
                      onClick={() => setPaymentMethod(method.key)}
                    >
                      <span className="payment-method-sidebar-icon" style={{ background: method.bg, color: method.color }}>{method.icon}</span>
                      <strong>{method.name}</strong>
                    </button>
                  ))}
                </div>
                {paymentMethod === "taobao_code" && (
                  <div className="activation-inline-box">
                    <input value={activationCode} onChange={(event) => setActivationCode(event.target.value)} placeholder="粘贴淘宝自动发货的激活码" />
                    <button type="button" className="btn-secondary" disabled={redeeming} onClick={redeemCode}>{redeeming ? "激活中..." : "激活充值"}</button>
                    {redeemResult ? <p className={redeemResult.success ? "pay-success" : "pay-error"}>{redeemResult.success ? "激活成功，余额已更新" : redeemResult.error}</p> : null}
                  </div>
                )}
              </div>

              {/* Pay button */}
              <button type="button" className="btn-primary recharge-pay-button" disabled={finalAmount <= 0 || paying} onClick={handleSubmit}>
                {paying ? "正在处理..." : orderSummary.typeLabel === "余额充值" ? "继续支付" : orderSummary.typeLabel === "周畅用包" ? "立即购买" : "立即订阅"}
              </button>
              <p className="recharge-sidebar-note">一般 10 秒内到账，异常订单可凭订单号联系客服处理。</p>
            </aside>
          </div>
        ) : (
          /* ===== PAYMENT STEP ===== */
          <div className="recharge-layout">
            <section className="recharge-main">
              <div className="recharge-section-card">
                <div className="section-heading-row">
                  <div><h2>{currentMethod.name}支付</h2><p>请按页面提示完成付款。</p></div>
                  {submittedOrder ? <StatusBadge status={submittedOrder.status} /> : null}
                </div>
                {paymentMethod === "taobao_code" ? (
                  <div className="taobao-payment-panel">
                    <PaymentQr src={paymentQrImages.taobao_code} methodName="淘宝激活码" hint="保存图片后打开淘宝 App 扫码，或点击按钮前往店铺。" />
                    <a href={TAOBAO_SHOP_URL} target="_blank" rel="noreferrer" className="btn-primary">立即前往淘宝店铺</a>
                    <div className="activation-box">
                      <input value={activationCode} onChange={(event) => setActivationCode(event.target.value)} placeholder="粘贴淘宝自动发货的激活码" />
                      <button type="button" className="btn-secondary" disabled={redeeming} onClick={redeemCode}>{redeeming ? "激活中..." : "激活充值"}</button>
                    </div>
                    {redeemResult ? <p className={redeemResult.success ? "pay-success" : "pay-error"}>{redeemResult.success ? "激活成功，余额已更新" : redeemResult.error}</p> : null}
                  </div>
                ) : (
                  <div className="payment-workspace">
                    <PaymentQr src={paymentSession?.qrImage || paymentQrImages[paymentMethod]} methodName={currentMethod.name} loading={paying && !manualFallback} error={paymentError} hint={manualFallback ? "当前自动支付通道未配置完整，请扫码后提交付款备注，管理员会人工确认。" : "扫码付款后，系统会自动处理到账。"} />
                    <PaymentBox title="付款备注 / 订单号" value={submittedOrder?.outTradeNo || submittedOrder?.id || paymentRef || "支付后可填写付款备注"} copied={copied} onCopy={copyText} />
                    <label className="payment-ref-input"><span>人工核对备注</span><input value={paymentRef} onChange={(event) => setPaymentRef(event.target.value)} placeholder="可填写微信/支付宝付款备注或淘宝订单号" /></label>
                    <button type="button" className="btn-secondary" disabled={paying} onClick={confirmPayment}>提交人工确认订单</button>
                  </div>
                )}
              </div>
            </section>

            <aside className="recharge-sidebar">
              <div className="recharge-summary-card">
                <h2>到账说明</h2>
                <div className="summary-rows">
                  <Row label="应付金额" value={formatMoney(finalAmount)} strong />
                  <Row label="支付方式" value={currentMethod.name} />
                  <Row label="订单状态" value={submittedOrder ? statusMap[submittedOrder.status]?.label || submittedOrder.status : "等待支付"} />
                </div>
                <button type="button" className="btn-secondary recharge-pay-button" onClick={() => setStep("choose")}>返回修改订单</button>
              </div>
            </aside>
          </div>
        )}

        {/* Trust grid */}
        <div className="recharge-trust-grid">
          {rechargeTrustItems.map((item) => (
            <div key={item.title}><strong>{item.title}</strong><p>{item.desc}</p></div>
          ))}
        </div>

        {packageDetail ? <CardDetailModal open={Boolean(packageDetail)} onOpenChange={(open) => { if (!open) setPackageDetail(null); }} {...packageDetail} /> : null}
        {commissionModal ? (
          <div className="referral-modal-backdrop" role="presentation" onMouseDown={() => setCommissionModal("")}>
            <form className="referral-action-modal" onSubmit={submitCommissionAction} onMouseDown={(event) => event.stopPropagation()}>
              <button type="button" className="referral-modal-close" onClick={() => setCommissionModal("")}>×</button>
              <span>{commissionModal === "convert" ? "佣金兑换" : "提现申请"}</span>
              <h2>{commissionModal === "convert" ? "使用佣金购买 Token" : "申请提现"}</h2>
              <p>
                当前可提现佣金为 <strong>¥{Number(referral?.withdrawableCommissionCny || 0).toFixed(2)}</strong>。
                {commissionModal === "convert" ? "确认使用佣金兑换 FlowAPI 余额 / Token 额度吗？" : "提现申请提交后，管理员审核通过后打款到你的支付宝或微信。"}
              </p>
              <label>
                <span>{commissionModal === "convert" ? "使用金额" : "提现金额"}</span>
                <input type="number" min="1" step="0.01" value={commissionForm.amountCny} onChange={(event) => setCommissionForm({ ...commissionForm, amountCny: event.target.value })} placeholder="输入金额" required />
              </label>
              {commissionModal === "withdraw" ? (
                <>
                  <label>
                    <span>提现方式</span>
                    <select value={commissionForm.method} onChange={(event) => setCommissionForm({ ...commissionForm, method: event.target.value })}>
                      <option value="alipay">支付宝</option>
                      <option value="wechat">微信</option>
                    </select>
                  </label>
                  <label><span>收款账号</span><input value={commissionForm.account} onChange={(event) => setCommissionForm({ ...commissionForm, account: event.target.value })} placeholder="支付宝账号 / 微信号" required /></label>
                  <label><span>收款姓名</span><input value={commissionForm.realName} onChange={(event) => setCommissionForm({ ...commissionForm, realName: event.target.value })} placeholder="用于人工核对" required /></label>
                  <label><span>备注</span><input value={commissionForm.remark} onChange={(event) => setCommissionForm({ ...commissionForm, remark: event.target.value })} placeholder="可选" /></label>
                  <small>最低提现金额：¥20。提现状态可在个人资料页查看。</small>
                </>
              ) : null}
              {commissionMessage ? <p className={commissionMessage.includes("失败") || commissionMessage.includes("不足") ? "referral-error" : "referral-success"}>{commissionMessage}</p> : null}
              <div className="referral-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setCommissionModal("")}>取消</button>
                <button type="submit" className="btn-primary">{commissionModal === "convert" ? "确认兑换" : "提交提现申请"}</button>
              </div>
            </form>
          </div>
        ) : null}
      </ConsoleLayout>
    </>
  );
}

/* ==================== Sub-components ==================== */

function CommissionAssetCard({ referral, onConvert, onWithdraw }) {
  const amount = Number(referral?.withdrawableCommissionCny || 0);
  return (
    <div className="recharge-summary-card recharge-commission-card">
      <span>邀请返佣资产</span>
      <h2>可提现佣金</h2>
      <strong>¥{amount.toFixed(2)}</strong>
      <p>你可以将佣金提现到支付宝 / 微信，也可以直接用佣金购买 Token。</p>
      <div className="recharge-commission-actions">
        <button type="button" className="btn-secondary" onClick={onConvert}>用佣金购买 Token</button>
        <button type="button" className="btn-secondary" onClick={onWithdraw}>申请提现</button>
      </div>
    </div>
  );
}

function PackageCard({ pkg, type, selected, onSelect, onDetail }) {
  const isMonthly = type === "monthly_subscription";
  const featured = pkg.featured || pkg.recommended;
  return (
    <button type="button" className={`recharge-package-card interactive-card ${selected ? "selected" : ""} ${featured ? "featured" : ""} ${pkg.featured ? "orange" : ""}`} onClick={onSelect}>
      <span className="interactive-card-icon" onClick={(event) => { event.stopPropagation(); onDetail(); }}>↗</span>
      <div className="recharge-package-topline"><span className="recharge-package-code">{pkg.code || pkg.name}</span>{(pkg.tag || pkg.recommended) && <span className={`recharge-package-tag ${pkg.featured ? "orange" : ""}`}>{pkg.recommended ? "推荐" : pkg.tag}</span>}</div>
      <div className="recharge-package-name">{pkg.name}</div>
      <div className="recharge-package-scene">{isMonthly ? pkg.quotaText : pkg.scene}</div>
      <div className="recharge-package-price"><strong>¥{Number(pkg.price).toFixed(0)}</strong><span>{isMonthly ? "/ 月" : ` / ${pkg.quotaText}`}</span></div>
      <ul className="recharge-package-benefits">{pkg.benefits.map((benefit) => <li key={benefit}><span>✓</span>{benefit}</li>)}</ul>
      <div className="recharge-package-actions"><span className={selected ? "recharge-package-action selected" : "recharge-package-action"}>{isMonthly ? "立即订阅" : "立即购买"}</span><span className="recharge-package-detail" onClick={(event) => { event.stopPropagation(); onDetail(); }}>查看详情</span></div>
    </button>
  );
}

function buildPackageDetail(pkg, type) {
  const isMonthly = type === "monthly_subscription";
  const rows = isMonthly ? [
    { label: "套餐名称", value: pkg.name }, { label: "每日额度 / 月总额度", value: `${pkg.quotaText} Token` }, { label: "售价", value: formatMoney(pkg.price) }, { label: "有效期", value: `${pkg.validDays} 天` }, { label: "每日重置规则", value: "每天自动重置当日额度，未使用部分不累计到下一天。" }, { label: "适合人群", value: "每天稳定使用 AI Coding、文案、自动化任务的用户。" },
  ] : [
    { label: "套餐名称", value: pkg.name }, { label: "套餐代号", value: pkg.code }, { label: "售价", value: formatMoney(pkg.price) }, { label: "Token 额度", value: `${pkg.quotaText} Token` }, { label: "有效期", value: `${pkg.validDays} 天` }, { label: "单价", value: pkg.unitPrice }, { label: "是否可叠加", value: "可叠加购买" }, { label: "消耗规则", value: "优先消耗最早到期权益" },
  ];
  const scenes = [
    { scenario: "日常轻量 Coding", description: "100 万 Token 大约适合日常轻量 Coding、接口调试、文案生成和简单自动化任务。" },
    { scenario: "批量任务", description: "适合摘要、分类、客服问答等重复任务，建议配合低成本模型。" },
    { scenario: "高价值任务", description: "复杂代码和长文本建议保留高质量模型，避免只按价格选择。" },
  ];
  return { title: `${pkg.name} 套餐详情`, description: isMonthly ? "查看月卡额度、重置规则、适合人群和购买后权益说明。" : "查看周畅用包额度、有效期、消耗规则和适合人群。", badge: isMonthly ? "月卡套餐" : "周畅用包", sections: [{ title: "套餐基础信息", content: <DetailRows rows={rows} /> }, { title: "套餐权益", content: <DetailTable columns={[{ key: "description", label: "权益说明" }]} rows={(pkg.benefits || []).map((benefit) => ({ description: benefit }))} /> }, { title: "适合场景", content: <DetailTable columns={[{ key: "scenario", label: "场景" }, { key: "description", label: "说明" }]} rows={scenes} /> }] };
}

function Row({ label, value, strong = false }) {
  return (
    <div className={`summary-row ${strong ? "strong" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const item = statusMap[status] || statusMap.pending;
  return <span style={{ padding: "5px 9px", borderRadius: 999, background: item.bg, color: item.color, fontSize: 12, fontWeight: 800 }}>{item.label}</span>;
}

function PaymentBox({ title, value, copied, onCopy }) {
  return (
    <div style={{ background: "var(--page-input-bg)", borderRadius: 14, border: "1px solid var(--page-card-border)", padding: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--page-sub)", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <code style={{ flex: 1, fontSize: 13, color: "var(--page-code-text)", background: "var(--page-card-bg)", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--page-card-border)", wordBreak: "break-all", fontFamily: "'SF Mono', monospace" }}>{value}</code>
        <button onClick={() => onCopy(value)} className="btn-secondary" style={{ padding: "10px 16px", fontSize: 13, minWidth: "auto", whiteSpace: "nowrap" }}>{copied === value ? "已复制" : "复制"}</button>
      </div>
    </div>
  );
}

function PaymentQr({ src, methodName, loading = false, error = "", hint = "" }) {
  const [missing, setMissing] = useState(false);
  return (
    <div style={{ background: "var(--page-input-bg)", borderRadius: 16, border: "1px solid var(--page-card-border)", padding: 18, textAlign: "center" }}>
      <div style={{ fontSize: 12, color: "var(--page-sub)", fontWeight: 800, marginBottom: 12 }}>{methodName}收款码</div>
      {loading ? <div style={{ background: "var(--page-card-bg)", border: "1px dashed #ddd", borderRadius: 14, padding: "26px 18px", color: "var(--page-sub)", fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>正在生成专属支付二维码</div>
       : error ? <div style={{ background: "#fff5f5", border: "1px dashed #fecaca", borderRadius: 14, padding: "26px 18px", color: "#b91c1c", fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>{error}</div>
       : !missing && src ? <Image src={src} alt={`${methodName}收款码`} onError={() => setMissing(true)} width={320} height={410} unoptimized style={{ width: "min(100%, 320px)", aspectRatio: "1 / 1.28", objectFit: "contain", borderRadius: 14, border: "1px solid var(--page-input-border)", background: "var(--page-card-bg)" }} />
       : <div style={{ background: "var(--page-card-bg)", border: "1px dashed #ddd", borderRadius: 14, padding: "26px 18px", color: "var(--page-sub)", fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>收款码正在配置中</div>
      }
      <div style={{ fontSize: 13, color: "var(--page-code-text)", marginTop: 12, lineHeight: 1.7 }}>{hint || "扫码付款后，系统会自动处理到账。"}</div>
    </div>
  );
}
