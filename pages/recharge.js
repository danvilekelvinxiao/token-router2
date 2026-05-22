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

const paymentQrImages = {
  wechat: "/images/pay/wechat.jpg",
  alipay: "/images/pay/alipay.jpg",
  taobao_code: "/images/pay/taobao.jpg",
};

const weeklyPackages = [
  {
    id: "cell_50",
    code: "CELL-50",
    name: "点火测试",
    scene: "低成本验证",
    price: 12,
    quotaText: "50 万",
    quotaTokens: 500000,
    validDays: 7,
    unitPrice: "0.24 元 / 万",
    tag: "试用",
    highlight: false,
    benefits: ["有效期：7 天", "单价：0.24 元 / 万", "可叠加购买", "优先消耗最早到期权益"],
  },
  {
    id: "drive_100",
    code: "DRIVE-100",
    name: "日常推进",
    scene: "日常 Coding",
    price: 24,
    quotaText: "100 万",
    quotaTokens: 1000000,
    validDays: 7,
    unitPrice: "0.24 元 / 万",
    tag: "常用",
    highlight: true,
    benefits: ["有效期：7 天", "单价：0.24 元 / 万", "可叠加购买", "优先消耗最早到期权益"],
  },
  {
    id: "orbit_200",
    code: "ORBIT-200",
    name: "高频航段",
    scene: "高频自动化",
    price: 45,
    quotaText: "200 万",
    quotaTokens: 2000000,
    validDays: 7,
    unitPrice: "0.23 元 / 万",
    tag: "高频",
    highlight: false,
    benefits: ["有效期：7 天", "单价：0.23 元 / 万", "可叠加购买", "优先消耗最早到期权益"],
  },
  {
    id: "core_500",
    code: "CORE-500",
    name: "主推燃料舱",
    scene: "长程主力",
    price: 108,
    quotaText: "500 万",
    quotaTokens: 5000000,
    validDays: 7,
    unitPrice: "0.22 元 / 万",
    tag: "主推",
    highlight: true,
    featured: true,
    benefits: ["有效期：7 天", "单价：0.22 元 / 万", "可叠加购买", "优先消耗最早到期权益"],
  },
];

const monthlyPackages = [
  {
    id: "monthly_probe",
    name: "前进一：探测",
    quotaText: "每日 10 万 / 月共 300 万",
    price: 30,
    validDays: 30,
    unitPrice: "0.10 元 / 万",
    totalValue: "¥72.00",
    plusEquivalent: "约等于 1 个 Plus",
    recommended: false,
    benefits: ["有效期：30 天", "单价：0.10 元 / 万", "额度重置：每天", "总额度：¥72.00", "约等于 1 个 Plus"],
  },
  {
    id: "monthly_launch",
    name: "前进二：启航",
    quotaText: "每日 30 万 / 月共 900 万",
    price: 98,
    validDays: 30,
    unitPrice: "0.11 元 / 万",
    totalValue: "¥216.00",
    plusEquivalent: "约等于 2 个 Plus",
    recommended: false,
    benefits: ["有效期：30 天", "单价：0.11 元 / 万", "额度重置：每天", "总额度：¥216.00", "约等于 2 个 Plus"],
  },
  {
    id: "monthly_cruise",
    name: "前进三：巡航",
    quotaText: "每日 50 万 / 月共 1500 万",
    price: 168,
    validDays: 30,
    unitPrice: "0.11 元 / 万",
    totalValue: "¥360.00",
    plusEquivalent: "约等于 3.5 个 Plus",
    recommended: true,
    benefits: ["有效期：30 天", "单价：0.11 元 / 万", "额度重置：每天", "总额度：¥360.00", "约等于 3.5 个 Plus"],
  },
];

const rechargeTrustItems = [
  { title: "自动到账优先", desc: "微信 / 支付宝商户通道可用时，支付成功后自动更新余额。" },
  { title: "订单全程可追踪", desc: "每笔充值都会生成订单状态，异常时方便核对和处理。" },
  { title: "淘宝激活码兜底", desc: "扫码不方便时，可通过淘宝购买激活码并自动充入当前账户。" },
  { title: "余额实时刷新", desc: "到账后余额会同步更新，API 调用不会因为等待确认而中断太久。" },
];

const taobaoHighlights = ["小额可订", "购买后自动发码", "输入激活码到账"];
const taobaoSteps = [
  "点击下方按钮前往淘宝店铺购买充值卡",
  "支付成功后淘宝会自动发送激活码",
  "复制激活码，粘贴到下方输入框",
  "点击“激活充值”即可自动到账",
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
  return {
    customerId,
    amount,
    paymentMethod,
    purchaseType,
    packageId: pkg?.id || "",
    packageName: pkg ? `${pkg.name}${pkg.code ? ` ${pkg.code}` : ""}` : "",
    quotaText: pkg?.quotaText || "",
    validDays: pkg?.validDays || null,
    paymentRef,
  };
}

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = localStorage.getItem("flowapi_customer");
      if (!stored) {
        router.push("/login");
        return;
      }
      let c;
      try {
        c = JSON.parse(stored);
      } catch {
        router.push("/login");
        return;
      }
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

      // Sync quota to New API after recharge completes
      const primaryKey = data.apiKeys?.[0];
      if (primaryKey?.newApiId) {
        fetch("/api/newapi/quota/recharge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenId: primaryKey.newApiId,
            quota: Number(data.balance || 0) * 10000,
          }),
        }).catch(() => {});
      }
    }

    const orderRes = await fetch(`/api/recharge?customerId=${c.id}`);
    if (orderRes.ok) {
      const data = await orderRes.json();
      setOrders(data.orders || []);
    }
  }

  useEffect(() => {
    if (step !== "pay" || paymentMethod === "taobao_code" || manualFallback || !submittedOrder?.id || submittedOrder.status === "approved") {
      return undefined;
    }

    const timer = window.setInterval(async () => {
      const res = await fetch(`/api/recharge?orderId=${submittedOrder.id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.order) return;
      setSubmittedOrder(data.order);
      if (data.order.status === "approved" && customer) {
        refreshCustomer(customer);
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [customer, manualFallback, paymentMethod, step, submittedOrder]);

  const selectedWeeklyPackage = useMemo(
    () => weeklyPackages.find((item) => item.id === selectedPackageId) || null,
    [selectedPackageId]
  );
  const selectedMonthlyPackage = useMemo(
    () => monthlyPackages.find((item) => item.id === selectedPackageId) || null,
    [selectedPackageId]
  );
  const selectedPackage = purchaseType === "weekly_package" ? selectedWeeklyPackage : purchaseType === "monthly_subscription" ? selectedMonthlyPackage : null;
  const selectedRechargeAmount = selectedAmount || Number(customAmount) || 0;
  const finalAmount = purchaseType === "balance_recharge" ? selectedRechargeAmount : Number(selectedPackage?.price || 0);
  const currentMethod = useMemo(
    () => paymentMethods.find((item) => item.key === paymentMethod) || paymentMethods[0],
    [paymentMethod]
  );
  const orderSummary = useMemo(() => {
    if (purchaseType === "weekly_package" && selectedPackage) {
      return {
        typeLabel: "周畅用包",
        packageName: `${selectedPackage.name} ${selectedPackage.code}`,
        quotaLabel: "获得额度",
        quotaValue: `${selectedPackage.quotaText} Token`,
        validDays: selectedPackage.validDays,
        amount: selectedPackage.price,
        buttonText: "立即购买",
      };
    }
    if (purchaseType === "monthly_subscription" && selectedPackage) {
      return {
        typeLabel: "月卡套餐",
        packageName: selectedPackage.name,
        quotaLabel: "每日额度 / 月总额度",
        quotaValue: `${selectedPackage.quotaText} Token`,
        validDays: selectedPackage.validDays,
        amount: selectedPackage.price,
        buttonText: "立即订阅",
      };
    }
    return {
      typeLabel: "余额充值",
      packageName: "",
      quotaLabel: "",
      quotaValue: "",
      validDays: null,
      amount: selectedRechargeAmount,
      buttonText: "继续支付",
    };
  }, [purchaseType, selectedPackage, selectedRechargeAmount]);
  const badges = ["人民币充值", "套餐可选", "异常订单人工兜底"];

  function selectRechargeAmount(amount) {
    setPurchaseType("balance_recharge");
    setSelectedAmount(amount);
    setSelectedPackageId(null);
    setCustomAmount("");
  }

  function selectCustomRechargeAmount(value) {
    setPurchaseType("balance_recharge");
    setCustomAmount(value);
    setSelectedAmount(null);
    setSelectedPackageId(null);
  }

  function selectPackage(type, packageId) {
    setPurchaseType(type);
    setSelectedPackageId(packageId);
    setSelectedAmount(null);
    setCustomAmount("");
  }

  async function handleSubmit() {
    if (finalAmount <= 0) return;
    setStep("pay");
    setSubmittedOrder(null);
    setPaymentSession(null);
    setPaymentError("");
    setManualFallback(false);

    const payload = getPaymentPayload({
      customerId: customer?.id,
      amount: finalAmount,
      paymentMethod,
      purchaseType,
      pkg: selectedPackage,
    });

    if (paymentMethod === "taobao_code" || !customer) {
      if (customer && purchaseType !== "balance_recharge") {
        try {
          const res = await fetch("/api/recharge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (res.ok && data.order) {
            setSubmittedOrder(data.order);
            setOrders((prev) => [data.order, ...prev]);
          }
        } catch {
          setPaymentError("套餐订单创建失败，请稍后再试");
        }
      }
      return;
    }

    setPaying(true);
    try {
      const res = await fetch("/api/recharge/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.mode === "manual") {
        setManualFallback(true);
        setPaymentError(data.reason || "");
      } else if (!res.ok) {
        setPaymentError(data.error || "支付订单生成失败");
      } else {
        setSubmittedOrder(data.order);
        setPaymentSession(data.payment);
      }
    } catch {
      setPaymentError("网络异常，请稍后再试");
    }
    setPaying(false);
  }

  async function confirmPayment() {
    if (!customer || finalAmount <= 0) return;
    const payload = getPaymentPayload({
      customerId: customer.id,
      amount: finalAmount,
      paymentMethod,
      purchaseType,
      pkg: selectedPackage,
      paymentRef,
    });
    setPaying(true);
    try {
      const res = await fetch("/api/recharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.order) {
        setSubmittedOrder(data.order);
        setOrders((prev) => [data.order, ...prev]);
        setPaymentRef("");
      } else {
        alert(data.error || "提交失败，请稍后再试");
      }
    } catch {
      alert("网络异常，请稍后再试");
    }
    setPaying(false);
  }

  async function redeemCode() {
    if (!customer || !activationCode.trim() || redeeming) return;
    setRedeeming(true);
    setRedeemResult(null);
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: activationCode.trim(), customerId: customer.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRedeemResult(data);
        setCustomer(data.customer);
        localStorage.setItem("flowapi_customer", JSON.stringify(data.customer));
      } else {
        setRedeemResult({ success: false, error: data.error || "激活失败，请检查激活码" });
      }
    } catch {
      setRedeemResult({ success: false, error: "网络异常，请稍后再试" });
    }
    setRedeeming(false);
  }

  async function copyText(text) {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(""), 1500);
  }

  if (!customer) {
    return (
      <main className="landing-shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--page-sub)" }}>加载中...</p>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>充值 - FlowAPI</title>
      </Head>

      <ConsoleLayout customer={customer} currentPath="/recharge">
        <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              资产管理
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "var(--page-heading)", margin: "4px 0 0", letterSpacing: "-0.03em" }}>
              充值 Token
            </h1>
            <p style={{ color: "var(--page-sub)", fontSize: 14, marginTop: 6 }}>
              当前余额 <strong style={{ color: "#6366f1", fontSize: 18 }}>¥ {Number(customer.balance).toFixed(2)}</strong>
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "stretch", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {badges.map((badge) => <span key={badge}>{badge}</span>)}
        </div>
      </div>

        {step === "choose" ? (
          <div className="recharge-layout">
            <section className="recharge-main">
              <div className="recharge-section-card">
                <div className="section-heading-row">
                  <div>
                    <h2>充值金额</h2>
                    <p>默认选择 ¥100，也可以输入自定义金额。点击套餐后会自动切换订单摘要。</p>
                  </div>
                </div>
                <div className="recharge-amount-grid">
                  {amounts.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={`recharge-amount-card ${purchaseType === "balance_recharge" && selectedAmount === item.value ? "selected" : ""}`}
                      onClick={() => selectRechargeAmount(item.value)}
                    >
                      <strong>{item.label}</strong>
                      <span>{item.desc}</span>
                    </button>
                  ))}
                </div>
                <label className="recharge-custom-input">
                  <span>自定义金额</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="输入充值金额"
                    value={customAmount}
                    onChange={(event) => selectCustomRechargeAmount(event.target.value)}
                  />
                </label>
              </div>

              <div className="recharge-section-card">
                <div className="section-heading-row">
                  <div>
                    <h2>支付方式</h2>
                    <p>选择你习惯的付款方式。商户通道未完整配置时会自动切到人工确认兜底。</p>
                  </div>
                </div>
                <div className="payment-method-grid">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.key}
                      type="button"
                      className={`payment-method-card ${paymentMethod === method.key ? "selected" : ""}`}
                      onClick={() => setPaymentMethod(method.key)}
                    >
                      <span style={{ background: method.bg, color: method.color }}>{method.icon}</span>
                      <strong>{method.name}</strong>
                    </button>
                  ))}
                </div>
              </div>

              <div className="recharge-section-card">
                <div className="section-heading-row">
                  <div>
                    <h2>Codex API — 周畅用包</h2>
                    <p>点击档位后生成订单，支付后自动或人工确认开通对应额度包。</p>
                  </div>
                  <span>支付宝直购 · 一周畅用</span>
                </div>
                <div className="recharge-package-grid weekly">
                  {weeklyPackages.map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      type="weekly_package"
                      selected={purchaseType === "weekly_package" && selectedPackageId === pkg.id}
                      onSelect={() => selectPackage("weekly_package", pkg.id)}
                      onDetail={() => setPackageDetail(buildPackageDetail(pkg, "weekly_package"))}
                    />
                  ))}
                </div>
              </div>

              <div className="recharge-section-card">
                <div className="section-heading-row">
                  <div>
                    <h2>月卡套餐</h2>
                    <p>购买区独立展示，已购权益以上方“我的订阅”为准。</p>
                  </div>
                  <span>每日额度 · 月度资源包</span>
                </div>
                <div className="recharge-package-grid monthly">
                  {monthlyPackages.map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      type="monthly_subscription"
                      selected={purchaseType === "monthly_subscription" && selectedPackageId === pkg.id}
                      onSelect={() => selectPackage("monthly_subscription", pkg.id)}
                      onDetail={() => setPackageDetail(buildPackageDetail(pkg, "monthly_subscription"))}
                    />
                  ))}
                </div>
              </div>

            </section>

            <aside className="recharge-summary-card">
              <h2>订单摘要</h2>
              <div className="summary-rows">
                <Row label="订单类型" value={orderSummary.typeLabel} />
                {orderSummary.packageName ? <Row label="套餐名称" value={orderSummary.packageName} /> : null}
                {orderSummary.quotaValue ? <Row label={orderSummary.quotaLabel} value={orderSummary.quotaValue} /> : null}
                {orderSummary.validDays ? <Row label="有效期" value={`${orderSummary.validDays} 天`} /> : null}
                <Row label="支付方式" value={currentMethod.name} />
                <Row label={purchaseType === "balance_recharge" ? "充值金额" : "套餐价格"} value={formatMoney(orderSummary.amount)} strong />
              </div>
              <button type="button" className="btn-primary recharge-pay-button" disabled={finalAmount <= 0 || paying} onClick={handleSubmit}>
                {paying ? "正在处理..." : orderSummary.buttonText}
              </button>
              <p>一般 10 秒内到账，异常订单可凭订单号联系客服处理。</p>
            </aside>
          </div>
        ) : (
          <div className="recharge-layout">
            <section className="recharge-main">
              <div className="recharge-section-card">
                <div className="section-heading-row">
                  <div>
                    <h2>{currentMethod.name}支付</h2>
                    <p>请按页面提示完成付款。支付后系统会自动检测到账，未自动到账可提交备注人工核对。</p>
                  </div>
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
                    <PaymentQr
                      src={paymentSession?.qrImage || paymentQrImages[paymentMethod]}
                      methodName={currentMethod.name}
                      loading={paying && !manualFallback}
                      error={paymentError}
                      hint={manualFallback ? "当前自动支付通道未配置完整，请扫码后提交付款备注，管理员会人工确认。" : "扫码付款后，系统会自动处理到账。"}
                    />
                    <PaymentBox title="付款备注 / 订单号" value={submittedOrder?.outTradeNo || submittedOrder?.id || paymentRef || "支付后可填写付款备注"} copied={copied} onCopy={copyText} />
                    <label className="payment-ref-input">
                      <span>人工核对备注</span>
                      <input value={paymentRef} onChange={(event) => setPaymentRef(event.target.value)} placeholder="可填写微信/支付宝付款备注或淘宝订单号" />
                    </label>
                    <button type="button" className="btn-secondary" disabled={paying} onClick={confirmPayment}>提交人工确认订单</button>
                  </div>
                )}
              </div>
            </section>

            <aside className="recharge-summary-card">
              <h2>到账说明</h2>
              <div className="summary-rows">
                <Row label="应付金额" value={formatMoney(finalAmount)} strong />
                <Row label="支付方式" value={currentMethod.name} />
                <Row label="订单状态" value={submittedOrder ? statusMap[submittedOrder.status]?.label || submittedOrder.status : "等待支付"} />
              </div>
              <button type="button" className="btn-secondary recharge-pay-button" onClick={() => setStep("choose")}>返回修改订单</button>
            </aside>
          </div>
        )}

        <div className="recharge-trust-grid">
          {rechargeTrustItems.map((item) => (
            <div key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>

        {packageDetail ? (
          <CardDetailModal
            open={Boolean(packageDetail)}
            onOpenChange={(open) => { if (!open) setPackageDetail(null); }}
            {...packageDetail}
          />
        ) : null}
      </ConsoleLayout>
    </>
  );
}

function PackageCard({ pkg, type, selected, onSelect, onDetail }) {
  const isMonthly = type === "monthly_subscription";
  const featured = pkg.featured || pkg.recommended;
  return (
    <button
      type="button"
      className={`recharge-package-card interactive-card ${selected ? "selected" : ""} ${featured ? "featured" : ""} ${pkg.featured ? "orange" : ""}`}
      onClick={onSelect}
    >
      <span className="interactive-card-icon" onClick={(event) => { event.stopPropagation(); onDetail(); }}>↗</span>
      <div className="recharge-package-topline">
        <span className="recharge-package-code">{pkg.code || pkg.name}</span>
        {(pkg.tag || pkg.recommended) && (
          <span className={`recharge-package-tag ${pkg.featured ? "orange" : ""}`}>
            {pkg.recommended ? "推荐" : pkg.tag}
          </span>
        )}
      </div>
      <div className="recharge-package-name">{pkg.name}</div>
      <div className="recharge-package-scene">{isMonthly ? pkg.quotaText : pkg.scene}</div>
      <div className="recharge-package-price">
        <strong>¥{Number(pkg.price).toFixed(0)}</strong>
        <span>{isMonthly ? "/ 月" : ` / ${pkg.quotaText}`}</span>
      </div>
      <ul className="recharge-package-benefits">
        {pkg.benefits.map((benefit) => (
          <li key={benefit}><span>✓</span>{benefit}</li>
        ))}
      </ul>
      <div className="recharge-package-actions">
        <span className={selected ? "recharge-package-action selected" : "recharge-package-action"}>
          {isMonthly ? "立即订阅" : "立即购买"}
        </span>
        <span className="recharge-package-detail" onClick={(event) => { event.stopPropagation(); onDetail(); }}>查看详情</span>
      </div>
    </button>
  );
}

function buildPackageDetail(pkg, type) {
  const isMonthly = type === "monthly_subscription";
  const rows = isMonthly ? [
    { label: "套餐名称", value: pkg.name },
    { label: "每日额度 / 月总额度", value: `${pkg.quotaText} Token` },
    { label: "售价", value: formatMoney(pkg.price) },
    { label: "有效期", value: `${pkg.validDays} 天` },
    { label: "每日重置规则", value: "每天自动重置当日额度，未使用部分不累计到下一天。" },
    { label: "是否支持叠加", value: "以实际订阅规则为准，后续可扩展叠加权益。" },
    { label: "适合人群", value: "每天稳定使用 AI Coding、文案、自动化任务的用户。" },
    { label: "不适合人群", value: "只做一次性测试、长期不登录或用量非常低的用户。" },
    { label: "购买后如何查看权益", value: "支付确认后在订单和账户权益区查看。" },
  ] : [
    { label: "套餐名称", value: pkg.name },
    { label: "套餐代号", value: pkg.code },
    { label: "售价", value: formatMoney(pkg.price) },
    { label: "Token 额度", value: `${pkg.quotaText} Token` },
    { label: "有效期", value: `${pkg.validDays} 天` },
    { label: "单价", value: pkg.unitPrice },
    { label: "是否可叠加", value: "可叠加购买" },
    { label: "消耗规则", value: "优先消耗最早到期权益" },
    { label: "到期规则", value: "到期后未用完的限时额度不再可用" },
    { label: "适合人群", value: "短期高频测试、日常 Coding、接口调试和批量自动化用户。" },
    { label: "不适合人群", value: "需要长期稳定每日额度的用户，建议选择月卡。" },
    { label: "购买后如何生效", value: "支付后自动或人工确认开通对应额度包。" },
  ];
  const scenes = [
    { scenario: "日常轻量 Coding", description: "100 万 Token 大约适合日常轻量 Coding、接口调试、文案生成和简单自动化任务。实际使用量会根据模型、提示词长度和输出长度变化。" },
    { scenario: "批量任务", description: "适合摘要、分类、客服问答等重复任务，建议配合低成本模型。" },
    { scenario: "高价值任务", description: "复杂代码和长文本建议保留高质量模型，避免只按价格选择。" },
  ];
  return {
    title: `${pkg.name} 套餐详情`,
    description: isMonthly ? "查看月卡额度、重置规则、适合人群和购买后权益说明。" : "查看周畅用包额度、有效期、消耗规则和适合人群。",
    badge: isMonthly ? "月卡套餐" : "周畅用包",
    sections: [
      { title: "套餐基础信息", content: <DetailRows rows={rows} /> },
      { title: "套餐权益", content: <DetailTable columns={[{ key: "description", label: "权益说明" }]} rows={(pkg.benefits || []).map((benefit) => ({ description: benefit }))} /> },
      { title: "适合场景", content: <DetailTable columns={[{ key: "scenario", label: "场景" }, { key: "description", label: "说明" }]} rows={scenes} /> },
    ],
  };
}

function Row({ label, value, strong = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
      <span style={{ color: "var(--page-sub)", fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: strong ? 900 : 700, color: strong ? "var(--dash-accent)" : "var(--page-heading)", fontSize: strong ? 18 : 13, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }) {
  const item = statusMap[status] || statusMap.pending;
  return (
    <span style={{ padding: "5px 9px", borderRadius: 999, background: item.bg, color: item.color, fontSize: 12, fontWeight: 800 }}>
      {item.label}
    </span>
  );
}

function PaymentBox({ title, value, copied, onCopy }) {
  return (
    <div style={{ background: "var(--page-input-bg)", borderRadius: 14, border: "1px solid var(--page-card-border)", padding: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--page-sub)", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <code style={{ flex: 1, fontSize: 13, color: "var(--page-code-text)", background: "var(--page-card-bg)", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--page-card-border)", wordBreak: "break-all", fontFamily: "'SF Mono', monospace" }}>
          {value}
        </code>
        <button onClick={() => onCopy(value)} className="btn-secondary" style={{ padding: "10px 16px", fontSize: 13, minWidth: "auto", whiteSpace: "nowrap" }}>
          {copied === value ? "已复制" : "复制"}
        </button>
      </div>
    </div>
  );
}

function PaymentQr({ src, methodName, loading = false, error = "", hint = "" }) {
  const [missing, setMissing] = useState(false);

  return (
    <div style={{ background: "var(--page-input-bg)", borderRadius: 16, border: "1px solid var(--page-card-border)", padding: 18, textAlign: "center" }}>
      <div style={{ fontSize: 12, color: "var(--page-sub)", fontWeight: 800, marginBottom: 12 }}>
        {methodName}收款码
      </div>
      {loading ? (
        <div style={{ background: "var(--page-card-bg)", border: "1px dashed #ddd", borderRadius: 14, padding: "26px 18px", color: "var(--page-sub)", fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>
          正在生成专属支付二维码
        </div>
      ) : error ? (
        <div style={{ background: "#fff5f5", border: "1px dashed #fecaca", borderRadius: 14, padding: "26px 18px", color: "#b91c1c", fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>
          {error}
        </div>
      ) : !missing && src ? (
        <Image
          src={src}
          alt={`${methodName}收款码`}
          onError={() => setMissing(true)}
          width={320}
          height={410}
          unoptimized
          style={{
            width: "min(100%, 320px)",
            aspectRatio: "1 / 1.28",
            objectFit: "contain",
            borderRadius: 14,
            border: "1px solid var(--page-input-border)",
            background: "var(--page-card-bg)",
          }}
        />
      ) : (
        <div style={{ background: "var(--page-card-bg)", border: "1px dashed #ddd", borderRadius: 14, padding: "26px 18px", color: "var(--page-sub)", fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>
          收款码正在配置中
        </div>
      )}
      <div style={{ fontSize: 13, color: "var(--page-code-text)", marginTop: 12, lineHeight: 1.7 }}>
        {hint || "扫码付款后，系统会自动处理到账。"}
      </div>
    </div>
  );
}
