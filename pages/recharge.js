import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import CardDetailModal, { DetailRows, DetailTable } from "@/components/CardDetailModal";
import WalletProgressCard from "@/components/wallet/wallet-progress-card";
import PaymentLaunchModal from "@/components/payments/payment-launch-modal";
import QrPaymentModal from "@/components/payments/qr-payment-modal";
import CryptoPaymentModal from "@/components/payments/crypto-payment-modal";
import PaymentSuccessModal from "@/components/payments/payment-success-modal";
import PaymentMethodIcon from "@/components/payments/payment-method-icon";
import { formatSmallCny } from "@/lib/format/number-format";
import { useLocale } from "@/components/providers/locale-provider";
import { useSafePolling } from "@/hooks/useSafePolling";

const amounts = [
  { value: 20, label: "¥20", desc: "体验测试" },
  { value: 50, label: "¥50", desc: "轻度使用" },
  { value: 100, label: "¥100", desc: "推荐入门" },
  { value: 200, label: "¥200", desc: "开发常用" },
  { value: 500, label: "¥500", desc: "团队测试" },
  { value: 1000, label: "¥1,000", desc: "大额充值" },
];

const paymentMethods = [
  { key: "wechat", name: "微信支付" },
  { key: "alipay", name: "支付宝" },
  { key: "crypto", name: "加密货币支付" },
  { key: "taobao_code", name: "淘宝激活码" },
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
  wechat: "/images/pay/wechat-manual-20260601.jpg",
  alipay: "/images/pay/alipay-manual-20260601.png",
  crypto: "",
  taobao_code: "/images/pay/taobao.jpg",
};
const cryptoChoices = [
  {
    token: "USDT",
    network: "TRON",
    key: "usdt-tron",
    address: "TJeTTxyTnvhmMMyGU9EUBmQwbjHhjgENeY",
    image: "/images/pay/crypto-usdt-tron.jpg",
  },
  {
    token: "USDT",
    network: "Ethereum",
    key: "usdt-ethereum",
    address: "0x5F2d4d7a2bd62A2bc1c50Dc1FD5513fcD5003D12",
    image: "/images/pay/crypto-usdt-ethereum.jpg",
  },
  {
    token: "USDC",
    network: "Ethereum",
    key: "usdc-ethereum",
    address: "0x5F2d4d7a2bd62A2bc1c50Dc1FD5513fcD5003D12",
    image: "/images/pay/crypto-usdc-ethereum.jpg",
  },
  {
    token: "USDC",
    network: "Polygon",
    key: "usdc-polygon",
    address: "0x5F2d4d7a2bd62A2bc1c50Dc1FD5513fcD5003D12",
    image: "/images/pay/crypto-usdc-polygon.jpg",
  },
];

function formatCryptoNetworkLabel(value = "") {
  const key = String(value || "").trim().toLowerCase();
  if (key === "tron" || key === "trc20") return "TRON";
  if (key === "polygon" || key === "matic") return "Polygon";
  if (key === "ethereum") return "Ethereum";
  return value || "-";
}

function applyOrderUpdate(nextOrder) {
  return (currentOrder) => {
    if (
      currentOrder?.id === nextOrder?.id
      && currentOrder?.status === nextOrder?.status
      && currentOrder?.paidAt === nextOrder?.paidAt
      && currentOrder?.updatedAt === nextOrder?.updatedAt
      && currentOrder?.gatewayStatus === nextOrder?.gatewayStatus
    ) {
      return currentOrder;
    }
    return nextOrder;
  };
}

const weeklyPackages = [
  { id: "cell_50", code: "CELL-50", name: "点火测试", scene: "低成本验证", price: 12, quotaText: "50 万", quotaTokens: 500000, validDays: 7, unitPrice: "¥0.24 / 万 Token", tag: "试用", highlight: false, benefits: ["有效期：7 天", "单价：¥0.24 / 万 Token", "可叠加购买", "优先消耗最早到期权益"] },
  { id: "drive_100", code: "DRIVE-100", name: "日常推进", scene: "日常 Coding", price: 24, quotaText: "100 万", quotaTokens: 1000000, validDays: 7, unitPrice: "¥0.24 / 万 Token", tag: "常用", highlight: true, benefits: ["有效期：7 天", "单价：¥0.24 / 万 Token", "可叠加购买", "优先消耗最早到期权益"] },
  { id: "orbit_200", code: "ORBIT-200", name: "高频航段", scene: "高频自动化", price: 45, quotaText: "200 万", quotaTokens: 2000000, validDays: 7, unitPrice: "¥0.23 / 万 Token", tag: "高频", highlight: false, benefits: ["有效期：7 天", "单价：¥0.23 / 万 Token", "可叠加购买", "优先消耗最早到期权益"] },
  { id: "core_500", code: "CORE-500", name: "主推燃料舱", scene: "长程主力", price: 108, quotaText: "500 万", quotaTokens: 5000000, validDays: 7, unitPrice: "¥0.22 / 万 Token", tag: "主推", highlight: true, featured: true, benefits: ["有效期：7 天", "单价：¥0.22 / 万 Token", "可叠加购买", "优先消耗最早到期权益"] },
];

const monthlyPackages = [
  { id: "monthly_probe", name: "前进一：探测", quotaText: "每日 10 万 / 月共 300 万", price: 30, validDays: 30, unitPrice: "¥0.10 / 万 Token", totalValue: "¥72.00", plusEquivalent: "约等于 1 个 Plus", recommended: false, benefits: ["有效期：30 天", "单价：¥0.10 / 万 Token", "额度重置：每天", "总额度：¥72.00", "约等于 1 个 Plus"] },
  { id: "monthly_launch", name: "前进二：启航", quotaText: "每日 30 万 / 月共 900 万", price: 98, validDays: 30, unitPrice: "¥0.11 / 万 Token", totalValue: "¥216.00", plusEquivalent: "约等于 2 个 Plus", recommended: false, benefits: ["有效期：30 天", "单价：¥0.11 / 万 Token", "额度重置：每天", "总额度：¥216.00", "约等于 2 个 Plus"] },
  { id: "monthly_cruise", name: "前进三：巡航", quotaText: "每日 50 万 / 月共 1500 万", price: 168, validDays: 30, unitPrice: "¥0.11 / 万 Token", totalValue: "¥360.00", plusEquivalent: "约等于 3.5 个 Plus", recommended: true, benefits: ["有效期：30 天", "单价：¥0.11 / 万 Token", "额度重置：每天", "总额度：¥360.00", "约等于 3.5 个 Plus"] },
];

const rechargeTrustItems = [
  { title: "自动到账优先", desc: "微信 / 支付宝商户通道可用时，支付成功后自动更新余额。" },
  { title: "订单全程可追踪", desc: "每笔充值都会生成订单状态，异常时方便核对和处理。" },
  { title: "淘宝激活码兜底", desc: "扫码不方便时，可通过淘宝购买激活码并自动充入当前账户。" },
  { title: "余额实时刷新", desc: "到账后余额会同步更新，API 调用不会因为等待确认而中断太久。" },
];

const TAOBAO_SHOP_URL = "https://e.tb.cn/h.R0y11RtMIOB7A40?tk=P4j75IXMHgi";
const QQ_GROUP_NUMBER = "217637139";

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
  return formatSmallCny(value);
}

function getPaymentPayload({ customerId, amount, paymentMethod, purchaseType, pkg, paymentRef = "" }) {
  return { customerId, amount, paymentMethod, purchaseType, packageId: pkg?.id || "", packageName: pkg ? `${pkg.name}${pkg.code ? ` ${pkg.code}` : ""}` : "", quotaText: pkg?.quotaText || "", validDays: pkg?.validDays || null, paymentRef };
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function calculateCryptoUsdAmount(amountCny) {
  const value = Number(amountCny);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 7);
}

/* ==================== Main Page ==================== */

export default function RechargePage() {
  const { locale } = useLocale();
  const isEn = locale === "en-US";
  const L = (zh, en) => (isEn ? en : zh);
  const router = useRouter();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [purchaseType, setPurchaseType] = useState("balance_recharge");
  const [selectedAmount, setSelectedAmount] = useState(100);
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [customAmount, setCustomAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("wechat");
  const [cryptoToken, setCryptoToken] = useState("USDT");
  const [cryptoNetwork, setCryptoNetwork] = useState("TRON");
  const [paymentRef, setPaymentRef] = useState("");
  const [step, setStep] = useState("choose");
  const [copied, setCopied] = useState("");
  const [paying, setPaying] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState(null);
  const [paymentSession, setPaymentSession] = useState(null);
  const [launchVisible, setLaunchVisible] = useState(false);
  const [activePaymentModal, setActivePaymentModal] = useState("");
  const [paymentSuccessVisible, setPaymentSuccessVisible] = useState(false);
  const [cryptoExpireAt, setCryptoExpireAt] = useState(null);
  const [cryptoNow, setCryptoNow] = useState(Date.now());
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
  const [walletData, setWalletData] = useState(null);
  const [walletLoading, setWalletLoading] = useState(true);

  const localizedPaymentMethods = useMemo(() => paymentMethods.map((method) => {
    if (method.key === "wechat") return { ...method, name: isEn ? "WeChat Pay" : "微信支付" };
    if (method.key === "alipay") return { ...method, name: isEn ? "Alipay" : "支付宝" };
    if (method.key === "crypto") return { ...method, name: isEn ? "Crypto (USDT / USDC)" : "加密货币支付" };
    if (method.key === "taobao_code") return { ...method, name: isEn ? "Taobao Activation Code" : "淘宝激活码" };
    return method;
  }), [isEn]);

  const localizedAmounts = useMemo(() => amounts.map((item) => {
    const descMap = {
      "体验测试": "Quick test",
      "轻度使用": "Light usage",
      "推荐入门": "Starter choice",
      "开发常用": "Developer standard",
      "团队测试": "Team testing",
      "大额充值": "Large top-up",
    };
    return { ...item, desc: isEn ? (descMap[item.desc] || item.desc) : item.desc };
  }), [isEn]);

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

  useEffect(() => {
    function handlePageShow() {
      setPaying(false);
      setLaunchVisible(false);
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

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
    if (!customer?.id) return undefined;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setWalletLoading(true); });
    fetch("/api/user/wallet-summary")
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setWalletData(data); })
      .catch(() => { if (!cancelled) setWalletData({ source: "empty", wallet: null, plan: null }); })
      .finally(() => { if (!cancelled) setWalletLoading(false); });
    return () => { cancelled = true; };
  }, [customer?.id, customer?.balance, orders.length]);

  const pollRechargeOrder = useCallback(async () => {
    if (!submittedOrder?.id) return;
    const res = await fetch(`/api/recharge?orderId=${submittedOrder.id}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.order) return;
    setSubmittedOrder(applyOrderUpdate(data.order));
    if (data.order.status === "approved") {
      setLaunchVisible(false);
      setActivePaymentModal("");
      setPaymentSuccessVisible(true);
      if (customer) refreshCustomer(customer);
    }
  }, [customer, submittedOrder?.id]);

  useSafePolling({
    intervalMs: 3000,
    enabled: step === "pay" && paymentMethod !== "taobao_code" && paymentMethod !== "crypto" && !manualFallback && Boolean(submittedOrder?.id) && submittedOrder?.status !== "approved",
    callback: pollRechargeOrder,
  });

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

  const currentMethod = useMemo(() => localizedPaymentMethods.find((item) => item.key === paymentMethod) || localizedPaymentMethods[0], [localizedPaymentMethods, paymentMethod]);
  const manualModeNotice = useMemo(() => {
    if (paymentMethod === "wechat") return "微信商户参数未配置完整，已切换到手动确认模式";
    if (paymentMethod === "alipay") return "支付宝商户参数未配置完整，已切换到手动确认模式";
    if (paymentMethod === "crypto" && manualFallback) return "GMWallet 暂时未能生成自动收银台，当前订单已切换到人工确认兜底。";
    return "";
  }, [paymentMethod, manualFallback]);
  const selectedCryptoChoice = useMemo(
    () => cryptoChoices.find((item) => item.token === cryptoToken && item.network === cryptoNetwork) || cryptoChoices[0],
    [cryptoToken, cryptoNetwork]
  );
  const cryptoNetworkOptions = useMemo(
    () => cryptoChoices.filter((item) => item.token === cryptoToken).map((item) => item.network),
    [cryptoToken]
  );
  const activeCryptoToken = String(paymentSession?.token || cryptoToken || "").toUpperCase();
  const activeCryptoNetwork = formatCryptoNetworkLabel(paymentSession?.network || cryptoNetwork);
  const activeCryptoAddress = paymentSession?.receiveAddress || (manualFallback ? selectedCryptoChoice?.address : "") || "";
  const activeCryptoQrValue = paymentSession?.checkoutUrl || activeCryptoAddress || "";
  const cryptoPaymentRef = useMemo(
    () => `币种：${cryptoToken}；网络：${cryptoNetwork}；地址：${selectedCryptoChoice?.address || ""}`,
    [cryptoNetwork, cryptoToken, selectedCryptoChoice?.address]
  );
  const paymentOrderNumber = useMemo(
    () => paymentSession?.orderId || submittedOrder?.outTradeNo || submittedOrder?.transactionNo || submittedOrder?.id || "-",
    [paymentSession?.orderId, submittedOrder?.id, submittedOrder?.outTradeNo, submittedOrder?.transactionNo]
  );
  const paymentStatusLabel = submittedOrder ? (statusMap[submittedOrder.status]?.label || submittedOrder.status) : L("等待支付", "Pending Payment");

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
    let summary = { typeLabel: isEn ? "Balance Top-up" : "余额充值", packageName: "", quotaLabel: "", quotaValue: "", validDays: null, amount: baseAmount };
    if (purchaseType === "weekly_package" && selectedPackage) {
      summary = { typeLabel: isEn ? "Weekly Pack" : "周畅用包", packageName: `${selectedPackage.name} ${selectedPackage.code}`, quotaLabel: isEn ? "Token Quota" : "获得额度", quotaValue: `${selectedPackage.quotaText} Token`, validDays: selectedPackage.validDays, amount: selectedPackage.price };
    } else if (purchaseType === "monthly_subscription" && selectedPackage) {
      summary = { typeLabel: isEn ? "Monthly Plan" : "月卡套餐", packageName: selectedPackage.name, quotaLabel: isEn ? "Daily / Monthly Quota" : "每日额度 / 月总额度", quotaValue: `${selectedPackage.quotaText} Token`, validDays: selectedPackage.validDays, amount: selectedPackage.price };
    }
    return summary;
  }, [purchaseType, selectedPackage, baseAmount, isEn]);

  const cryptoMinutesLeft = useMemo(() => {
    if (!cryptoExpireAt) return "10:00";
    const diff = Math.max(0, cryptoExpireAt - cryptoNow);
    const mm = String(Math.floor(diff / 60000)).padStart(2, "0");
    const ss = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [cryptoExpireAt, cryptoNow]);

  const cryptoAmountEstimate = useMemo(() => {
    if (Number(paymentSession?.actualAmount) > 0) return Number(paymentSession.actualAmount).toFixed(2);
    return calculateCryptoUsdAmount(finalAmount).toFixed(2);
  }, [finalAmount, paymentSession?.actualAmount]);
  const cryptoUsdEstimate = useMemo(() => {
    if (Number(paymentSession?.amountUsd) > 0) return `$${Number(paymentSession.amountUsd).toFixed(2)}`;
    return `$${calculateCryptoUsdAmount(finalAmount).toFixed(2)}`;
  }, [finalAmount, paymentSession?.amountUsd]);
  const qrModalTitle = paymentMethod === "wechat" ? L("微信支付", "WeChat Pay") : L("支付宝支付", "Alipay");
  const launchTitle = paymentMethod === "crypto"
    ? L("正在生成链上支付订单...", "Generating on-chain payment order...")
    : L("正在拉起支付中...", "Preparing your payment...");

  /* ---------- Handlers ---------- */

  function selectRechargeAmount(amount) { setPurchaseType("balance_recharge"); setSelectedAmount(amount); setSelectedPackageId(null); setCustomAmount(""); }
  function selectCustomRechargeAmount(value) { setPurchaseType("balance_recharge"); setCustomAmount(value); setSelectedAmount(null); setSelectedPackageId(null); }
  function selectPackage(type, packageId) { setPurchaseType(type); setSelectedPackageId(packageId); setSelectedAmount(null); setCustomAmount(""); }
  function handleCryptoTokenChange(nextToken) {
    const matched = cryptoChoices.find((item) => item.token === nextToken);
    setCryptoToken(nextToken);
    if (matched) setCryptoNetwork(matched.network);
  }

  function toggleAddOn(id) {
    setSelectedAddOns((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function handleSubmit() {
    if (finalAmount <= 0) return;
    if (
      paymentMethod === "crypto" &&
      paymentSession?.checkoutUrl &&
      submittedOrder?.status !== "approved" &&
      (!cryptoExpireAt || cryptoExpireAt > Date.now())
    ) {
      setPaying(false);
      setLaunchVisible(false);
      window.location.assign(paymentSession.checkoutUrl);
      return;
    }
    setSubmittedOrder(null);
    setPaymentSession(null);
    setLaunchVisible(paymentMethod !== "taobao_code");
    setActivePaymentModal("");
    setPaymentSuccessVisible(false);
    setCryptoExpireAt(null);
    setCryptoNow(Date.now());
    setPaymentError("");
    setManualFallback(false);
    const payload = getPaymentPayload({
      customerId: customer?.id,
      amount: finalAmount,
      paymentMethod,
      cryptoToken,
      cryptoNetwork,
      purchaseType,
      pkg: selectedPackage,
      paymentRef: paymentMethod === "crypto" ? cryptoPaymentRef : "",
    });
    if (paymentMethod === "taobao_code" || !customer) {
      setLaunchVisible(false);
      if (customer && purchaseType !== "balance_recharge") {
        try {
          const { response: res, data } = await fetchJsonWithTimeout("/api/recharge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (res.ok && data.order) { setSubmittedOrder(data.order); setOrders((prev) => [data.order, ...prev]); setStep("pay"); }
          else setPaymentError(data.error || L("套餐订单创建失败，请稍后再试", "Package order creation failed. Please try again."));
        } catch { setPaymentError(L("支付订单创建失败，请稍后重试或联系客服。", "Payment order creation failed. Please try again or contact support.")); }
      }
      return;
    }
    if (paymentMethod === "crypto") {
      setPaying(true);
      try {
        const { response: res, data } = await fetchJsonWithTimeout("/api/payments/crypto/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          setPaymentError(data.error || L("支付订单创建失败，请稍后重试或联系客服。", "Payment order creation failed. Please try again or contact support."));
          setStep("choose");
        } else {
          setSubmittedOrder(data.order);
          setPaymentSession(data.payment || null);
          if (data.mode === "manual") {
            setStep("pay");
            setActivePaymentModal("crypto");
            setManualFallback(true);
            setPaymentError(data.reason || L("当前链路暂未接通自动到账，已切换为人工确认。", "Automatic settlement is not available for this network yet. Switched to manual confirmation."));
            setCryptoExpireAt(null);
          } else {
            setCryptoExpireAt(data.payment?.expiresAt ? new Date(data.payment.expiresAt).getTime() : Date.now() + 10 * 60 * 1000);
            if (data.payment?.checkoutUrl) {
              window.location.assign(data.payment.checkoutUrl);
              return;
            }
            setStep("pay");
            setActivePaymentModal("");
            setPaymentError(L("GMWallet 已创建订单但未返回收银台链接，请联系客服处理订单号。", "GMWallet order was created but no checkout URL was returned. Contact support with the order number."));
          }
          setCryptoNow(Date.now());
        }
      } catch {
        setPaymentError(L("支付订单创建失败，请稍后重试或联系客服。", "Payment order creation failed. Please try again or contact support."));
        setStep("choose");
      }
      setLaunchVisible(false);
      setPaying(false);
      return;
    }
    setPaying(true);
    try {
      const { response: res, data } = await fetchJsonWithTimeout("/api/recharge/create-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok && data.order) {
        setSubmittedOrder(data.order);
        setPaymentSession(data.payment || { orderId: data.order.outTradeNo || data.order.id });
        setStep("pay");
        setActivePaymentModal("qr");
        if (data.mode === "manual") { setManualFallback(true); setPaymentError(data.reason || ""); }
      } else {
        setPaymentError(data.error || L("支付订单创建失败，请稍后重试或联系客服。", "Payment order creation failed. Please try again or contact support."));
        setStep("choose");
      }
    } catch {
      setPaymentError(L("支付订单创建失败，请稍后重试或联系客服。", "Payment order creation failed. Please try again or contact support."));
      setStep("choose");
    }
    setLaunchVisible(false);
    setPaying(false);
  }

  function closePaymentFlow() {
    setLaunchVisible(false);
    setActivePaymentModal("");
    setPaymentSuccessVisible(false);
    setStep("choose");
  }

  async function confirmPayment() {
    if (!customer || finalAmount <= 0) return;
    if (paymentMethod === "crypto" && manualFallback && submittedOrder?.id) {
      setPaying(true);
      try {
        const res = await fetch("/api/recharge/manual-confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: submittedOrder.id,
            paymentRef,
            providerTradeNo: paymentRef,
            gatewayPayload: JSON.stringify({
              token: activeCryptoToken,
              network: activeCryptoNetwork,
              address: activeCryptoAddress,
              note: paymentRef,
            }),
          }),
        });
        const data = await res.json();
        if (res.ok && data.order) {
          setSubmittedOrder(data.order);
          setPaymentError(data.message || L("已提交人工确认，请等待后台核对到账。", "Manual confirmation submitted. Please wait for review."));
        } else {
          alert(data.error || L("提交失败，请稍后再试", "Submit failed. Please try again."));
        }
      } catch {
        alert(L("网络异常，请稍后再试", "Network error. Please try again."));
      }
      setPaying(false);
      return;
    }
    const payload = getPaymentPayload({ customerId: customer.id, amount: finalAmount, paymentMethod, purchaseType, pkg: selectedPackage, paymentRef });
    setPaying(true);
    try {
      const res = await fetch("/api/recharge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok && data.order) { setSubmittedOrder(data.order); setOrders((prev) => [data.order, ...prev]); setPaymentRef(""); }
      else { alert(data.error || L("提交失败，请稍后再试", "Submit failed. Please try again.")); }
    } catch { alert(L("网络异常，请稍后再试", "Network error. Please try again.")); }
    setPaying(false);
  }

  async function checkCryptoStatus() {
    if (!submittedOrder?.id) return;
    setPaying(true);
    try {
      const search = new URLSearchParams({ orderId: submittedOrder.id });
      if (paymentSession?.tradeId) search.set("tradeId", paymentSession.tradeId);
      const res = await fetch(`/api/payments/crypto/status?${search.toString()}`);
      const data = await res.json();
      if (res.ok && data.order) {
        setSubmittedOrder(data.order);
        if (data.paid) {
          setLaunchVisible(false);
          setActivePaymentModal("");
          setPaymentSuccessVisible(true);
          if (customer) refreshCustomer(customer);
        }
        if (!data.paid) {
          setPaymentError(data.gatewayError || L("订单等待链上确认中，请完成支付后刷新状态。", "Waiting for chain confirmation. Please refresh after payment."));
        } else {
          setPaymentError("");
        }
      } else {
        setPaymentError(data.error || L("状态查询失败", "Status query failed"));
      }
    } catch {
      setPaymentError(L("网络异常，请稍后重试", "Network error. Please try again."));
    }
    setPaying(false);
  }

  const pollCryptoPayment = useCallback(async () => {
    if (!submittedOrder?.id) return;
    const search = new URLSearchParams({ orderId: submittedOrder.id });
    if (paymentSession?.tradeId) search.set("tradeId", paymentSession.tradeId);
    const res = await fetch(`/api/payments/crypto/status?${search.toString()}`);
    const data = await res.json();
    if (data?.order) {
      setSubmittedOrder(applyOrderUpdate(data.order));
      if (data.paid) {
        setLaunchVisible(false);
        setActivePaymentModal("");
        setPaymentSuccessVisible(true);
        if (customer) refreshCustomer(customer);
      }
    }
  }, [customer, paymentSession?.tradeId, submittedOrder?.id]);

  useSafePolling({
    intervalMs: 3000,
    enabled: paymentMethod === "crypto" && step === "pay" && !manualFallback && Boolean(submittedOrder?.id) && submittedOrder?.status !== "approved",
    callback: pollCryptoPayment,
  });

  useSafePolling({
    intervalMs: 1000,
    enabled: Boolean(cryptoExpireAt) && paymentMethod === "crypto" && step === "pay" && !manualFallback && submittedOrder?.status !== "approved",
    callback: () => {
      setCryptoNow(Date.now());
    },
    pauseWhenHidden: false,
  });

  async function redeemCode() {
    if (!customer || !activationCode.trim() || redeeming) return;
    setRedeeming(true);
    setRedeemResult(null);
    try {
      const res = await fetch("/api/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: activationCode.trim(), customerId: customer.id }) });
      const data = await res.json();
      if (res.ok && data.success) { setRedeemResult(data); setCustomer(data.customer); localStorage.setItem("flowapi_customer", JSON.stringify(data.customer)); }
      else { setRedeemResult({ success: false, error: data.error || L("激活失败，请检查激活码", "Activation failed. Please check the code.") }); }
    } catch { setRedeemResult({ success: false, error: L("网络异常，请稍后再试", "Network error. Please try again.") }); }
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
        <p style={{ color: "var(--page-sub)" }}>{L("加载中...", "Loading...")}</p>
      </main>
    );
  }

  /* ==================== Render ==================== */

  return (
    <>
      <Head><title>{L("充值 - FlowAPI", "Recharge - FlowAPI")}</title></Head>
      <ConsoleLayout customer={customer} currentPath="/recharge">
        {/* Page header */}
        <div className="recharge-page-header">
          <div>
            <span className="recharge-page-kicker">{L("资产管理", "Asset Management")}</span>
            <h1>{L("充值 Token", "Recharge Token")}</h1>
          </div>
        </div>

        <WalletProgressCard
          mode="recharge"
          loading={walletLoading}
          empty={!walletLoading && walletData?.source === "empty"}
          balanceCny={Number(walletData?.wallet?.balanceCny ?? customer.balance ?? 0)}
          totalQuotaCny={Number(walletData?.wallet?.totalQuotaCny || 0)}
          usedQuotaCny={Number(walletData?.wallet?.usedQuotaCny || 0)}
          remainingQuotaCny={Number(walletData?.wallet?.remainingQuotaCny ?? walletData?.wallet?.balanceCny ?? customer.balance ?? 0)}
          totalTokens={walletData?.token?.totalTokens}
          usedTokens={walletData?.token?.usedTokens}
          remainingTokens={walletData?.token?.remainingTokens}
          planName={walletData?.plan?.planName}
          planAmountCny={walletData?.plan?.planAmountCny}
          planStatus={walletData?.plan?.status || "none"}
          startedAt={walletData?.plan?.startedAt}
          expiresAt={walletData?.plan?.expiresAt}
          remainingDays={walletData?.plan?.remainingDays}
          progressPercent={Number(walletData?.wallet?.progressPercent || 0)}
          data={walletData}
        />

        {step === "choose" ? (
          <div className="recharge-layout">

            {/* ===== LEFT: Main area ===== */}
            <section className="recharge-main">

              {/* 1. Recharge amount */}
              <div className="recharge-section-card">
                <div className="section-heading-row">
                  <div><h2>{L("充值金额", "Top-up Amount")}</h2><p>{L("选择预设金额或输入自定义金额。", "Select a preset amount or enter a custom amount.")}</p></div>
                </div>
                <div className="recharge-amount-grid">
                  {localizedAmounts.map((item) => (
                    <button key={item.value} type="button" className={`recharge-amount-card ${purchaseType === "balance_recharge" && selectedAmount === item.value ? "selected" : ""}`} onClick={() => selectRechargeAmount(item.value)}>
                      <strong>{item.label}</strong><span>{item.desc}</span>
                    </button>
                  ))}
                </div>
                <label className="recharge-custom-input">
                  <span>{L("自定义金额", "Custom Amount")}</span>
                  <input type="number" min="1" placeholder={L("输入充值金额", "Enter top-up amount")} value={customAmount} onChange={(event) => selectCustomRechargeAmount(event.target.value)} />
                </label>
              </div>

              {/* 2. Add-on services */}
              <div className="recharge-section-card">
                <div className="section-heading-row">
                  <div>
                    <h2>{L("附加服务", "Add-on Services")}</h2>
                    <p>{L("可选增值服务，适合需要人工协助、订阅支持、额度代充或接入配置的用户。", "Optional value-added services for setup, subscriptions, and credits support.")}</p>
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
                          {isSelected ? L("已选择", "Selected") : L("选择服务", "Select")}
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
                <h2>{L("订单摘要", "Order Summary")}</h2>
                <div className="summary-rows">
                  <Row label={L("订单类型", "Order Type")} value={orderSummary.typeLabel} />
                  {orderSummary.packageName ? <Row label={L("套餐名称", "Plan Name")} value={orderSummary.packageName} /> : null}
                  {orderSummary.quotaValue ? <Row label={orderSummary.quotaLabel} value={orderSummary.quotaValue} /> : null}
                  {orderSummary.validDays ? <Row label={L("有效期", "Validity")} value={`${orderSummary.validDays} ${L("天", "days")}`} /> : null}
                  <Row label={purchaseType === "balance_recharge" ? L("充值金额", "Top-up Amount") : L("套餐价格", "Plan Price")} value={formatMoney(baseAmount)} strong />

                  {selectedAddOnDetails.length > 0 && (
                    <div className="summary-addons">
                      <div className="summary-addons-label">{L("附加服务", "Add-ons")}</div>
                      {selectedAddOnDetails.map((svc) => (
                        <div key={svc.id} className="summary-addon-row">
                          <span>{svc.title}{svc.quantity ? ` ${svc.quantity} ${svc.unit}` : ""}</span>
                          <span>¥{svc.total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="summary-divider" />
                  <Row label={L("应付金额", "Amount Due")} value={formatMoney(finalAmount)} strong />
                </div>
              </div>

              {/* Payment method */}
              <div className="recharge-summary-card">
                <h2>{L("支付方式", "Payment Method")}</h2>
                <div className="payment-method-sidebar-grid">
                  {localizedPaymentMethods.map((method) => (
                    <button
                      key={method.key}
                      type="button"
                      className={`payment-method-sidebar-card ${paymentMethod === method.key ? "selected" : ""}`}
                      onClick={() => setPaymentMethod(method.key)}
                    >
                      <span className="payment-method-sidebar-icon"><PaymentMethodIcon method={method.key} /></span>
                      <strong>{method.name}</strong>
                      <span className="payment-method-selected-check" aria-hidden="true">✓</span>
                    </button>
                  ))}
                </div>
                {paymentMethod === "crypto" ? (
                  <div className="payment-method-config-card">
                    <div className="payment-method-config-head">
                      <strong>{L("选择币种与网络", "Choose token and network")}</strong>
                      <span>{L("下单后进入链上收银台", "Checkout opens after order creation")}</span>
                    </div>
                    <div className="payment-method-config-grid">
                      <div className="payment-method-config-group">
                        <span>{L("币种", "Token")}</span>
                        <SegmentedSelect options={["USDT", "USDC"]} value={cryptoToken} onChange={handleCryptoTokenChange} />
                      </div>
                      <div className="payment-method-config-group">
                        <span>{L("网络", "Network")}</span>
                        <SegmentedSelect options={cryptoNetworkOptions} value={cryptoNetwork} onChange={setCryptoNetwork} />
                      </div>
                    </div>
                    <div className="payment-method-config-note">
                      <strong>{L("GMWallet 专属收银台", "GMWallet dedicated checkout")}</strong>
                      <p>
                        {L("下单后会同步展示订单号、倒计时、二维码、地址复制和到账轮询。仅支持 USDT / USDC。", "After order creation, the page syncs order number, countdown, QR code, address copy and payment polling. Only USDT / USDC are supported.")}
                      </p>
                    </div>
                  </div>
                ) : null}
                {paymentMethod === "taobao_code" && (
                  <div className="payment-method-config-card">
                    <div className="payment-method-config-head">
                      <strong>{L("淘宝激活码充值", "Taobao activation code")}</strong>
                      <span>{L("下单后复制自动发货激活码，再回到这里激活到账", "Copy the auto-delivered activation code after purchase, then redeem it here")}</span>
                    </div>
                    <div className="payment-method-store-card">
                      <span>{L("淘宝店铺", "Taobao Store")}</span>
                      <strong>{L("刀塔电竞", "Daota Esports")}</strong>
                      <p>{L("购买后会自动发货专属激活码，适合不方便扫码支付时使用。", "The store auto-delivers a dedicated activation code after purchase, ideal when QR payment is inconvenient.")}</p>
                      <a href={TAOBAO_SHOP_URL} target="_blank" rel="noreferrer" className="btn-secondary payment-method-link">
                        {L("打开淘宝店铺", "Open Taobao Store")}
                      </a>
                    </div>
                    <div className="activation-inline-box">
                      <label className="activation-inline-field">
                        <span>{L("激活码", "Activation Code")}</span>
                        <input value={activationCode} onChange={(event) => setActivationCode(event.target.value)} placeholder={L("粘贴淘宝自动发货的激活码", "Paste activation code from Taobao")} />
                      </label>
                      <button type="button" className="btn-secondary payment-method-link" disabled={redeeming} onClick={redeemCode}>{redeeming ? L("激活中...", "Activating...") : L("激活充值", "Activate")}</button>
                      {redeemResult ? <p className={redeemResult.success ? "pay-success" : "pay-error"}>{redeemResult.success ? L("激活成功，余额已更新", "Activated successfully, balance updated") : redeemResult.error}</p> : null}
                    </div>
                  </div>
                )}
              </div>

              {/* Pay button */}
              <button type="button" className="btn-primary recharge-pay-button" disabled={finalAmount <= 0 || paying} onClick={handleSubmit}>
                {paying
                  ? L("正在处理...", "Processing...")
                  : paymentMethod === "crypto"
                    ? L("创建加密货币支付订单", "Create Crypto Payment Order")
                    : orderSummary.typeLabel === L("余额充值", "Balance Top-up")
                      ? L("继续支付", "Continue Payment")
                      : orderSummary.typeLabel === L("周畅用包", "Weekly Pack")
                        ? L("立即购买", "Buy Now")
                        : L("立即订阅", "Subscribe Now")}
              </button>
              <p className="recharge-sidebar-note">{L("一般 10 秒内到账，异常订单可凭订单号联系客服处理。", "Usually credited within 10 seconds. Contact support with your order number if anything is abnormal.")}</p>

              <RechargeSupportCard copied={copied} onCopy={copyText} />
            </aside>
          </div>
        ) : (
          /* ===== PAYMENT STEP ===== */
          <div className="recharge-layout">
            <section className="recharge-main">
              <div className="recharge-section-card">
                <div className="section-heading-row">
                  <div><h2>{currentMethod.name}{L("支付", "")}</h2><p>{L("请按页面提示完成付款。", "Please complete payment as instructed.")}</p></div>
                  {submittedOrder ? <StatusBadge status={submittedOrder.status} /> : null}
                </div>
                {paymentMethod === "taobao_code" ? (
                  <div className="taobao-payment-panel">
                    <PaymentQr src={paymentQrImages.taobao_code} methodName={L("淘宝激活码", "Taobao Activation Code")} hint={L("保存图片后打开淘宝 App 扫码，或点击按钮前往店铺。", "Save image and scan in Taobao app, or open the store directly.")} />
                    <a href={TAOBAO_SHOP_URL} target="_blank" rel="noreferrer" className="btn-primary">{L("立即前往淘宝店铺", "Open Taobao Store")}</a>
                    <div className="activation-box">
                      <input value={activationCode} onChange={(event) => setActivationCode(event.target.value)} placeholder={L("粘贴淘宝自动发货的激活码", "Paste activation code from Taobao")} />
                      <button type="button" className="btn-secondary" disabled={redeeming} onClick={redeemCode}>{redeeming ? L("激活中...", "Activating...") : L("激活充值", "Activate")}</button>
                    </div>
                    {redeemResult ? <p className={redeemResult.success ? "pay-success" : "pay-error"}>{redeemResult.success ? L("激活成功，余额已更新", "Activated successfully, balance updated") : redeemResult.error}</p> : null}
                  </div>
                ) : paymentMethod === "crypto" ? (
                  <div className="payment-workspace">
                    {paymentError ? <p className="pay-error">{paymentError}</p> : null}
                    <div className="payment-box" style={{ display: "grid", gap: 10 }}>
                      <strong>{L("收银台", "Checkout")}</strong>
                      <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                        {cryptoAmountEstimate} {activeCryptoToken}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--page-sub)" }}>
                        {L("订单金额", "Order Amount")}：{formatMoney(finalAmount)}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--page-sub)" }}>
                        {L("订单号", "Order No.")}：{paymentSession?.orderId || submittedOrder?.outTradeNo || submittedOrder?.transactionNo || "-"}
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: "#16a34a", fontVariantNumeric: "tabular-nums" }}>
                        {manualFallback ? L("人工确认", "Manual Review") : cryptoMinutesLeft}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 12 }}>
                      <SegmentedSelect options={["USDT", "USDC"]} value={cryptoToken} onChange={handleCryptoTokenChange} />
                      <SegmentedSelect options={cryptoNetworkOptions} value={cryptoNetwork} onChange={setCryptoNetwork} />
                    </div>
                    <PaymentQr
                      src={selectedCryptoChoice.image}
                      qrValue={activeCryptoAddress}
                      methodName={`${activeCryptoToken} · ${activeCryptoNetwork}`}
                      loading={false}
                      hint={L("请务必选择与钱包一致的币种和网络再转账。", "Please transfer with the exact token and network shown above.")}
                    />
                    <PaymentBox title={L("收款地址", "Wallet Address")} value={activeCryptoAddress} copied={copied} onCopy={copyText} />
                    <PaymentBox title={L("交易流水号", "Transaction No.")} value={submittedOrder?.outTradeNo || submittedOrder?.transactionNo || L("生成中", "Generating")} copied={copied} onCopy={copyText} />
                    {paymentSession?.checkoutUrl ? (
                      <a href={paymentSession.checkoutUrl} target="_blank" rel="noreferrer" className="btn-primary">
                        {L("打开加密货币收银台", "Open Crypto Checkout")}
                      </a>
                    ) : null}
                    <div style={{ fontSize: 12, color: "var(--page-sub)", lineHeight: 1.6 }}>
                      {manualFallback
                        ? L("GMWallet 自动下单失败时才进入人工确认兜底，请提交 TxHash 或付款备注。", "Manual review is only used when GMWallet checkout fails. Submit TxHash or payment note.")
                        : L("请按 GMWallet 订单展示的币种、网络、金额和地址转账。系统每 3 秒自动查询一次到账状态。", "Transfer with the exact token, network, amount and address shown by GMWallet. The system checks payment status every 3 seconds.")}
                    </div>
                    {manualFallback ? (
                      <>
                        <label className="payment-ref-input"><span>{L("转账哈希 / 备注", "Transfer Hash / Note")}</span><input value={paymentRef} onChange={(event) => setPaymentRef(event.target.value)} placeholder={L("填写 TxHash、转账备注或钱包昵称，方便人工核对", "Enter TxHash, transfer note or wallet nickname for manual review")} /></label>
                        <button type="button" className="btn-secondary" disabled={paying} onClick={confirmPayment}>{L("提交人工确认订单", "Submit for Manual Confirmation")}</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn-primary" disabled={submittedOrder?.status === "approved"} onClick={checkCryptoStatus}>
                          {submittedOrder?.status === "approved" ? L("已到账", "Paid") : L("我已完成转账", "I Have Transferred")}
                        </button>
                        <button type="button" className="btn-secondary" disabled={paying} onClick={checkCryptoStatus}>
                          {paying ? L("查询中...", "Checking...") : L("刷新支付状态", "Refresh Payment Status")}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="payment-workspace">
                    <p className="pay-error">{paymentError || manualModeNotice}</p>
                    <PaymentQr
                      src={paymentQrImages[paymentMethod]}
                      methodName={currentMethod.name}
                      loading={false}
                      error={paymentError}
                      hint={L("请使用对应支付 App 扫码付款，付款后填写备注并提交人工确认。", "Scan with the corresponding payment app, then submit your payment note for manual confirmation.")}
                    />
                    <PaymentBox title={L("付款备注 / 订单号", "Payment Note / Order ID")} value={submittedOrder?.outTradeNo || submittedOrder?.id || paymentRef || L("支付后可填写付款备注", "Fill in your payment note after paying")} copied={copied} onCopy={copyText} />
                    <label className="payment-ref-input"><span>{L("人工核对备注", "Manual Verification Note")}</span><input value={paymentRef} onChange={(event) => setPaymentRef(event.target.value)} placeholder={L("可填写微信/支付宝付款备注或淘宝订单号", "You can enter WeChat/Alipay note or Taobao order number")} /></label>
                    <button type="button" className="btn-secondary" disabled={paying} onClick={confirmPayment}>{L("提交人工确认订单", "Submit for Manual Confirmation")}</button>
                  </div>
                )}
              </div>
            </section>

            <aside className="recharge-sidebar">
              <div className="recharge-summary-card">
                <h2>{L("到账说明", "Payment Notes")}</h2>
                <div className="summary-rows">
                  <Row label={L("应付金额", "Amount Due")} value={formatMoney(finalAmount)} strong />
                  <Row label={L("支付方式", "Payment Method")} value={currentMethod.name} />
                  {paymentMethod === "crypto" ? <Row label={L("币种 / 网络", "Token / Network")} value={`${activeCryptoToken} / ${activeCryptoNetwork}`} /> : null}
                  <Row label={L("交易流水号", "Transaction No.")} value={submittedOrder?.outTradeNo || submittedOrder?.transactionNo || L("生成中", "Generating")} />
                  <Row label={L("订单状态", "Order Status")} value={submittedOrder ? statusMap[submittedOrder.status]?.label || submittedOrder.status : L("等待支付", "Pending Payment")} />
                </div>
                <button type="button" className="btn-secondary recharge-pay-button" onClick={() => setStep("choose")}>{L("返回修改订单", "Back to Edit Order")}</button>
              </div>
              <RechargeSupportCard copied={copied} onCopy={copyText} />
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
        <PaymentLaunchModal
          open={launchVisible}
          title={launchTitle}
          description={paymentMethod === "crypto"
            ? L("我们正在为这笔充值生成专属链上订单，请不要重复点击。", "We are creating a dedicated on-chain order for this payment. No need to click again.")
            : L("系统正在拉起支付收银台并同步本次订单信息。", "We are preparing your cashier flow and syncing the order details.")}
          progressLabel={paymentMethod === "crypto"
            ? L("预计 1 秒内完成，随后进入链上收银台。", "Usually ready within 1 second, then we open the crypto cashier.")
            : L("预计 1 秒内完成，随后展示扫码支付页面。", "Usually ready within 1 second, then we show the QR cashier.")}
          onClose={closePaymentFlow}
        />
        <QrPaymentModal
          open={activePaymentModal === "qr"}
          title={qrModalTitle}
          amountLabel={formatMoney(finalAmount)}
          orderNumber={paymentOrderNumber}
          methodName={currentMethod.name}
          qrSrc={paymentSession?.qrImage || paymentQrImages[paymentMethod]}
          qrValue={paymentSession?.qrContent || ""}
          hint={L("请使用对应支付 App 扫码，支付后填写备注并提交，方便更快核对。", "Scan with the corresponding app, then submit your payment note for faster verification.")}
          notice={manualModeNotice || L("当前走人工确认模式，付款备注越清晰，到账越快。", "This payment is currently under manual confirmation. Clear notes help us credit it faster.")}
          statusLabel={paymentStatusLabel}
          paymentRef={paymentRef}
          onPaymentRefChange={setPaymentRef}
          onConfirm={confirmPayment}
          onClose={closePaymentFlow}
          onCopy={copyText}
          copied={copied}
          error={paymentError}
          processing={paying}
          confirmLabel={L("提交人工确认订单", "Submit for manual confirmation")}
        />
        <CryptoPaymentModal
          open={activePaymentModal === "crypto"}
          title={L("加密货币支付", "Crypto Payment")}
          amountLabel={`${cryptoAmountEstimate} ${activeCryptoToken}`}
          cnyAmountLabel={formatMoney(finalAmount)}
          usdAmountLabel={cryptoUsdEstimate}
          orderNumber={paymentOrderNumber}
          token={activeCryptoToken}
          network={activeCryptoNetwork}
          countdown={cryptoMinutesLeft}
          address={activeCryptoAddress}
          qrSrc={selectedCryptoChoice.image}
          qrValue={activeCryptoQrValue}
          notice={manualModeNotice || L("转账完成后系统会自动轮询到账状态，也可以手动刷新。", "The system will keep polling after transfer, and you can also refresh manually.")}
          statusLabel={paymentStatusLabel}
          paymentRef={paymentRef}
          onPaymentRefChange={setPaymentRef}
          manualFallback={manualFallback}
          copied={copied}
          onCopy={copyText}
          onClose={closePaymentFlow}
          onRefresh={checkCryptoStatus}
          onConfirm={manualFallback ? confirmPayment : checkCryptoStatus}
          processing={paying}
          checkoutUrl={paymentSession?.checkoutUrl}
          error={paymentError}
        />
        <PaymentSuccessModal
          open={paymentSuccessVisible}
          title={L("支付成功，余额已更新", "Payment successful, balance updated")}
          description={L("这笔充值已经到账，你现在可以继续调用模型或返回数据面板查看最新资产变化。", "This top-up has been credited. You can continue calling models or return to the dashboard to view your updated balance.")}
          orderNumber={paymentOrderNumber}
          methodName={currentMethod.name}
          amountLabel={formatMoney(finalAmount)}
          onViewOrders={() => router.push("/profile")}
          onGoDashboard={() => router.push("/dashboard")}
          onContinue={() => {
            setPaymentSuccessVisible(false);
            setStep("choose");
          }}
        />
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

function RechargeSupportCard({ copied, onCopy }) {
  return (
    <div className="recharge-summary-card recharge-support-card">
      <span>人工兜底支持</span>
      <h2>充值遇到问题可联系我</h2>
      <p>支付未到账、激活码异常、套餐开通失败，都可以把订单号发到群里处理。</p>
      <div className="recharge-support-grid">
        <div>
          <strong>QQ 群</strong>
          <code>{QQ_GROUP_NUMBER}</code>
          <button type="button" onClick={() => onCopy(QQ_GROUP_NUMBER)}>{copied === QQ_GROUP_NUMBER ? "已复制" : "复制群号"}</button>
        </div>
        <div>
          <strong>微信群</strong>
          <code>添加微信后邀请入群</code>
          <button type="button" onClick={() => onCopy("请在 QQ 群联系 FlowAPI 管理员拉你进微信群")}>{copied.includes("微信群") ? "已复制" : "复制说明"}</button>
        </div>
      </div>
      <div className="recharge-support-qr">
        <Image src="/images/qq-group-qr.png" alt="FlowAPI QQ 群二维码" width={148} height={148} />
        <small>扫码加入 QQ 群，充值异常和 API 配置问题都可以在群里问。</small>
      </div>
    </div>
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
      <div className="recharge-package-actions">
        <span className={selected ? "recharge-package-action selected" : "recharge-package-action"}>{isMonthly ? "立即订阅" : "立即购买"}</span>
        <span className="recharge-package-detail" aria-label="查看套餐详情" onClick={(event) => { event.stopPropagation(); onDetail(); }}>↗</span>
      </div>
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

function SegmentedSelect({ options, value, onChange }) {
  return (
    <div className="segmented-select">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`segmented-select-option ${value === option ? "selected" : ""}`}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
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

function PaymentQr({ src, qrValue = "", methodName, loading = false, error = "", hint = "" }) {
  const [missing, setMissing] = useState(false);
  const [dynamicQrSrc, setDynamicQrSrc] = useState("");
  const directSrc = src ? `${src}${src.includes("?") ? "&" : "?"}v=20260601-manual` : "";

  useEffect(() => {
    let cancelled = false;
    if (!qrValue) return undefined;
    import("qrcode")
      .then((mod) => mod.toDataURL(qrValue, { margin: 1, width: 320 }))
      .then((url) => {
        if (!cancelled) setDynamicQrSrc(url);
      })
      .catch(() => {
        if (!cancelled) setDynamicQrSrc("");
      });
    return () => {
      cancelled = true;
    };
  }, [qrValue]);

  return (
    <div style={{ background: "var(--page-input-bg)", borderRadius: 16, border: "1px solid var(--page-card-border)", padding: 18, textAlign: "center" }}>
      <div style={{ fontSize: 12, color: "var(--page-sub)", fontWeight: 800, marginBottom: 12 }}>{methodName}收款码</div>
      {loading ? <div style={{ background: "var(--page-card-bg)", border: "1px dashed #ddd", borderRadius: 14, padding: "26px 18px", color: "var(--page-sub)", fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>正在生成专属支付二维码</div>
       : dynamicQrSrc ? <img src={dynamicQrSrc} alt={`${methodName}收款码`} style={{ width: "min(100%, 320px)", aspectRatio: "1 / 1", objectFit: "contain", borderRadius: 14, border: "1px solid var(--page-input-border)", background: "#fff", padding: 12 }} />
       : !missing && directSrc ? <img src={directSrc} alt={`${methodName}收款码`} onError={() => setMissing(true)} style={{ width: "min(100%, 320px)", aspectRatio: "1 / 1.28", objectFit: "contain", borderRadius: 14, border: "1px solid var(--page-input-border)", background: "var(--page-card-bg)" }} />
       : <div style={{ background: "var(--page-card-bg)", border: "1px dashed #ddd", borderRadius: 14, padding: "26px 18px", color: "var(--page-sub)", fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>收款码正在配置中</div>
      }
      {error ? (
        <div style={{ marginTop: 10, background: "#fff5f5", border: "1px dashed #fecaca", borderRadius: 10, padding: "10px 12px", color: "#b91c1c", fontSize: 12, fontWeight: 700, lineHeight: 1.6 }}>
          {error}
        </div>
      ) : null}
      <div style={{ fontSize: 13, color: "var(--page-code-text)", marginTop: 12, lineHeight: 1.7 }}>{hint || "扫码付款后，系统会自动处理到账。"}</div>
    </div>
  );
}
