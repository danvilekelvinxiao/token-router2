export const dynamic = "force-dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";

const statusText = {
  pending: "待确认",
  approved: "已到账",
  rejected: "未通过",
};

function isAdminCustomer(customer) {
  return Boolean(
    customer?.isAdmin ||
    customer?.id === "cus_admin" ||
    String(customer?.email || "").toLowerCase() === "xiaoyijie@flowapi.fun"
  );
}

export default function AdminRechargesPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState(null);
  const [secret, setSecret] = useState("");
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("orders");
  const [codes, setCodes] = useState([]);
  const [codeStatus, setCodeStatus] = useState("");
  const [codeAmount, setCodeAmount] = useState("");
  const [codeCount, setCodeCount] = useState(1);
  const [codeNote, setCodeNote] = useState("");
  const [genResult, setGenResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logCategory, setLogCategory] = useState("");
  const [logAction, setLogAction] = useState("");
  const [logPage, setLogPage] = useState(0);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initializeAdmin() {
      await Promise.resolve();
      if (cancelled) return;

      const stored = localStorage.getItem("flowapi_customer");
      if (!stored) {
        router.push("/login");
        return;
      }
      try {
        const parsed = JSON.parse(stored);
        setCustomer(parsed);
        if (!isAdminCustomer(parsed)) {
          setForbidden(true);
          return;
        }
      } catch {
        router.push("/login");
        return;
      }
      const savedSecret = sessionStorage.getItem("flowapi_admin_secret") || "";
      setSecret(savedSecret);
      if (savedSecret) loadOrders(savedSecret, "pending");
    }

    initializeAdmin();
    return () => {
      cancelled = true;
    };
    // This page intentionally performs one-time localStorage bootstrapping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (forbidden) {
    return (
      <>
        <Head>
          <title>无权限 - FlowAPI</title>
        </Head>
        <ConsoleLayout customer={customer || { name: "用户", email: "", id: "", balance: 0, apiKeys: [] }} currentPath="/admin/recharges">
          <div className="admin-guard-card">
            <span>403</span>
            <h1>你没有权限访问充值审核</h1>
            <p>充值审核属于管理员功能。普通用户可继续使用数据面板、API 管理、充值和帮助指南。</p>
            <button type="button" onClick={() => router.push("/dashboard")}>返回数据面板</button>
          </div>
        </ConsoleLayout>
      </>
    );
  }

  async function loadOrders(nextSecret = secret, nextStatus = status) {
    if (!nextSecret) {
      setMessage("请输入管理密钥");
      return;
    }
    setLoading(true);
    setMessage("");
    sessionStorage.setItem("flowapi_admin_secret", nextSecret);
    try {
      const query = nextStatus ? `?status=${encodeURIComponent(nextStatus)}` : "";
      const res = await fetch(`/api/admin/recharges${query}`, {
        headers: { "x-admin-secret": nextSecret },
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "加载失败");
        setOrders([]);
      } else {
        setOrders(data.orders || []);
      }
    } catch {
      setMessage("网络异常，请稍后再试");
    }
    setLoading(false);
  }

  async function loadCodes(nextSecret = secret, nextStatus = codeStatus) {
    if (!nextSecret) {
      setMessage("请输入管理密钥");
      return;
    }
    setLoading(true);
    setMessage("");
    sessionStorage.setItem("flowapi_admin_secret", nextSecret);
    try {
      const query = nextStatus ? `?status=${encodeURIComponent(nextStatus)}` : "";
      const res = await fetch(`/api/admin/activation-codes${query}`, {
        headers: { "x-admin-secret": nextSecret },
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "加载失败");
        setCodes([]);
      } else {
        setCodes(data.codes || []);
      }
    } catch {
      setMessage("网络异常，请稍后再试");
    }
    setLoading(false);
  }

  async function generateCodes() {
    if (!secret || !codeAmount) return;
    setLoading(true);
    setMessage("");
    setGenResult(null);
    try {
      const res = await fetch("/api/admin/activation-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ amount: Number(codeAmount), count: codeCount, note: codeNote }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "生成失败");
      } else {
        setGenResult(data.codes || []);
        setMessage(`已生成 ${data.codes.length} 个激活码`);
        await loadCodes(secret, codeStatus);
      }
    } catch {
      setMessage("网络异常，请稍后再试");
    }
    setLoading(false);
  }

  async function loadLogs(nextSecret = secret, category = logCategory, action = logAction, page = logPage) {
    if (!nextSecret) {
      setMessage("请输入管理密钥");
      return;
    }
    setLoading(true);
    setMessage("");
    sessionStorage.setItem("flowapi_admin_secret", nextSecret);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (action) params.set("action", action);
      params.set("limit", "50");
      params.set("offset", String(page * 50));
      const res = await fetch(`/api/admin/activity-logs?${params.toString()}`, {
        headers: { "x-admin-secret": nextSecret },
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "加载失败");
        setLogs([]);
        setLogTotal(0);
      } else {
        setLogs(data.logs || []);
        setLogTotal(data.total || 0);
      }
    } catch {
      setMessage("网络异常，请稍后再试");
    }
    setLoading(false);
  }

  async function approve(orderId) {
    if (!window.confirm("确认这笔充值已经收到款了吗？")) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/recharges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret,
        },
        body: JSON.stringify({ orderId, action: "approve" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "确认失败");
      } else {
        setMessage(`已到账：¥ ${Number(data.order.amount).toFixed(2)}`);
        await loadOrders(secret, status);
      }
    } catch {
      setMessage("网络异常，请稍后再试");
    }
    setLoading(false);
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
        <title>充值审核 - FlowAPI</title>
      </Head>

      <ConsoleLayout customer={customer} currentPath="/admin/recharges">
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            管理后台
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "var(--page-heading)", margin: "4px 0 0", letterSpacing: "-0.03em" }}>
            充值管理
          </h1>
        </div>

        <div className="admin-recharge-tabs" style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => { setTab("orders"); setGenResult(null); }}
            className={tab === "orders" ? "btn-primary" : "btn-secondary"}
            style={{ fontSize: 14 }}
          >
            充值订单
          </button>
          <button
            onClick={() => { setTab("codes"); loadCodes(); }}
            className={tab === "codes" ? "btn-primary" : "btn-secondary"}
            style={{ fontSize: 14 }}
          >
            激活码管理
          </button>
          <button
            onClick={() => { setTab("logs"); loadLogs(); }}
            className={tab === "logs" ? "btn-primary" : "btn-secondary"}
            style={{ fontSize: 14 }}
          >
            活动日志
          </button>
        </div>

        <div className="admin-recharge-filter-card" style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 16, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "minmax(200px, 1fr) auto auto", gap: 12 }}>
          <input
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="管理密钥"
            style={{ border: "1px solid var(--page-input-border)", borderRadius: 12, padding: "12px 14px", outline: "none", fontSize: 14, fontFamily: "inherit" }}
          />
          {tab === "orders" ? (
            <>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  loadOrders(secret, event.target.value);
                }}
                style={{ border: "1px solid var(--page-input-border)", borderRadius: 12, padding: "12px 14px", outline: "none", fontSize: 14, fontFamily: "inherit", background: "var(--page-card-bg)" }}
              >
                <option value="pending">待确认</option>
                <option value="">全部订单</option>
                <option value="approved">已到账</option>
              </select>
              <button className="btn-primary" onClick={() => loadOrders()} disabled={loading} style={{ opacity: loading ? 0.6 : 1 }}>
                {loading ? "加载中" : "加载订单"}
              </button>
            </>
          ) : tab === "codes" ? (
            <>
              <select
                value={codeStatus}
                onChange={(event) => {
                  setCodeStatus(event.target.value);
                  loadCodes(secret, event.target.value);
                }}
                style={{ border: "1px solid var(--page-input-border)", borderRadius: 12, padding: "12px 14px", outline: "none", fontSize: 14, fontFamily: "inherit", background: "var(--page-card-bg)" }}
              >
                <option value="">全部状态</option>
                <option value="active">未使用</option>
                <option value="redeemed">已使用</option>
              </select>
              <button className="btn-primary" onClick={() => loadCodes()} disabled={loading} style={{ opacity: loading ? 0.6 : 1 }}>
                {loading ? "加载中" : "加载激活码"}
              </button>
            </>
          ) : (
            <>
              <select
                value={logCategory}
                onChange={(event) => {
                  setLogCategory(event.target.value);
                  setLogPage(0);
                  loadLogs(secret, event.target.value, logAction, 0);
                }}
                style={{ border: "1px solid var(--page-input-border)", borderRadius: 12, padding: "12px 14px", outline: "none", fontSize: 14, fontFamily: "inherit", background: "var(--page-card-bg)" }}
              >
                <option value="">全部分类</option>
                <option value="auth">认证</option>
                <option value="payment">支付</option>
                <option value="api">API 调用</option>
                <option value="api_key">API Key</option>
              </select>
              <button className="btn-primary" onClick={() => { setLogPage(0); loadLogs(secret, logCategory, logAction, 0); }} disabled={loading} style={{ opacity: loading ? 0.6 : 1 }}>
                {loading ? "加载中" : "加载日志"}
              </button>
            </>
          )}
        </div>

        {message && (
          <div style={{ background: "var(--page-selected-bg)", color: "#6366f1", border: "1px solid #ddd6fe", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 800, marginBottom: 16 }}>
            {message}
          </div>
        )}

        {tab === "orders" ? (
          <div style={{ display: "grid", gap: 12 }}>
            {orders.map((order) => (
              <div key={order.id} style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 16, padding: 18, display: "grid", gridTemplateColumns: "1fr 150px 120px", gap: 16, alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 18, color: "var(--page-heading)" }}>¥ {Number(order.amount).toFixed(2)}</strong>
                    <span style={{ padding: "5px 9px", borderRadius: 999, background: order.status === "approved" ? "#f0fdf4" : "#fffbeb", color: order.status === "approved" ? "#16a34a" : "#f59e0b", fontSize: 12, fontWeight: 800 }}>
                      {statusText[order.status] || order.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--page-code-text)", marginTop: 8 }}>
                    {order.customerName || "未填姓名"} · {order.customerEmail || "无邮箱"}
                  </div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 6, lineHeight: 1.6 }}>
                    {formatPayment(order.paymentMethod)} · {order.paymentRef || "未填写备注"} · {formatDate(order.createdAt)}
                  </div>
                  <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>{order.id}</div>
                </div>
                <div style={{ fontSize: 13, color: "var(--page-sub)" }}>
                  {order.approvedAt ? `到账时间 ${formatDate(order.approvedAt)}` : "等待确认收款"}
                </div>
                {order.status === "pending" ? (
                  <button className="btn-primary" onClick={() => approve(order.id)} disabled={loading} style={{ width: "100%" }}>
                    确认到账
                  </button>
                ) : (
                  <button className="btn-secondary" disabled style={{ width: "100%", opacity: 0.6 }}>
                    已处理
                  </button>
                )}
              </div>
            ))}
            {!orders.length && (
              <div style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 16, padding: 36, textAlign: "center", color: "var(--page-subtle)", fontWeight: 700 }}>
                暂无订单
              </div>
            )}
          </div>
        ) : tab === "codes" ? (
          <div style={{ display: "grid", gap: 20 }}>
            <div style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: "var(--page-heading)", marginBottom: 16 }}>生成激活码</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 1fr", gap: 12, marginBottom: 12 }}>
                <input
                  type="number"
                  value={codeAmount}
                  onChange={(e) => setCodeAmount(e.target.value)}
                  placeholder="面额（元）"
                  min={1}
                  style={{ border: "1px solid var(--page-input-border)", borderRadius: 12, padding: "12px 14px", outline: "none", fontSize: 14, fontFamily: "inherit" }}
                />
                <input
                  type="number"
                  value={codeCount}
                  onChange={(e) => setCodeCount(Number(e.target.value) || 1)}
                  placeholder="数量"
                  min={1}
                  max={100}
                  style={{ border: "1px solid var(--page-input-border)", borderRadius: 12, padding: "12px 14px", outline: "none", fontSize: 14, fontFamily: "inherit" }}
                />
                <input
                  value={codeNote}
                  onChange={(e) => setCodeNote(e.target.value)}
                  placeholder="备注（可选）"
                  style={{ border: "1px solid var(--page-input-border)", borderRadius: 12, padding: "12px 14px", outline: "none", fontSize: 14, fontFamily: "inherit" }}
                />
              </div>
              <button className="btn-primary" onClick={generateCodes} disabled={loading || !codeAmount} style={{ width: "100%", opacity: loading || !codeAmount ? 0.5 : 1 }}>
                {loading ? "生成中..." : "生成激活码"}
              </button>

              {genResult && genResult.length > 0 && (
                <div style={{ marginTop: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#16a34a", marginBottom: 10 }}>
                    已生成 {genResult.length} 个激活码（面额 ¥{Number(codeAmount).toFixed(2)}）：
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {genResult.map((c) => (
                      <code key={c.id} style={{ background: "var(--page-card-bg)", padding: "8px 12px", borderRadius: 8, fontSize: 14, fontFamily: "'SF Mono', monospace", letterSpacing: "0.03em", border: "1px solid #dcfce7", userSelect: "all" }}>
                        {c.code}
                      </code>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--page-sub)", marginTop: 10 }}>请复制激活码并发送给淘宝下单客户</div>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {codes.map((c) => (
                <div key={c.id} style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 14, padding: 16, display: "grid", gridTemplateColumns: "1fr 120px 180px 120px", gap: 14, alignItems: "center" }}>
                  <div>
                    <code style={{ fontSize: 15, fontFamily: "'SF Mono', monospace", letterSpacing: "0.03em", color: "var(--page-heading)" }}>{c.code}</code>
                    <div style={{ fontSize: 12, color: "var(--page-subtle)", marginTop: 4 }}>{c.note || "无备注"}</div>
                  </div>
                  <strong style={{ fontSize: 18, color: "var(--page-heading)" }}>¥ {Number(c.amount).toFixed(2)}</strong>
                  <div style={{ fontSize: 12, color: "var(--page-sub)" }}>
                    {formatDate(c.createdAt)}
                    {c.redeemedAt && <><br />使用于 {formatDate(c.redeemedAt)}</>}
                  </div>
                  <span style={{ padding: "5px 9px", borderRadius: 999, background: c.status === "active" ? "#f0fdf4" : "#fef2f2", color: c.status === "active" ? "#16a34a" : "#ef4444", fontSize: 12, fontWeight: 800, textAlign: "center" }}>
                    {c.status === "active" ? "未使用" : "已使用"}
                  </span>
                </div>
              ))}
              {!codes.length && (
                <div style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 16, padding: 36, textAlign: "center", color: "var(--page-subtle)", fontWeight: 700 }}>
                  暂无激活码
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 16, padding: 20, display: "flex", gap: 12, alignItems: "center" }}>
              <strong style={{ whiteSpace: "nowrap", fontSize: 13, color: "var(--page-code-text)" }}>操作类型</strong>
              <select
                value={logAction}
                onChange={(e) => { setLogAction(e.target.value); setLogPage(0); loadLogs(secret, logCategory, e.target.value, 0); }}
                style={{ border: "1px solid var(--page-input-border)", borderRadius: 10, padding: "8px 12px", outline: "none", fontSize: 13, fontFamily: "inherit", background: "var(--page-card-bg)" }}
              >
                <option value="">全部</option>
                <option value="register">注册</option>
                <option value="login">登录</option>
                <option value="api_call">API 调用</option>
                <option value="recharge_order">充值订单</option>
                <option value="recharge_approved">充值到账</option>
                <option value="redeem_code">激活码兑换</option>
                <option value="create_key">创建 API Key</option>
              </select>
              <span style={{ fontSize: 12, color: "var(--page-subtle)", marginLeft: "auto" }}>共 {logTotal} 条</span>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {logs.map((log) => (
                <div key={log.id} style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 12, padding: "14px 16px", display: "grid", gridTemplateColumns: "100px 100px 1fr 120px 160px", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 8px", borderRadius: 6, background: log.category === "auth" ? "#f5f3ff" : log.category === "payment" ? "#fef3c7" : log.category === "api" ? "#dbeafe" : "#f0fdf4", color: log.category === "auth" ? "#7c3aed" : log.category === "payment" ? "#d97706" : log.category === "api" ? "#2563eb" : "#16a34a", textAlign: "center" }}>
                    {log.category === "auth" ? "认证" : log.category === "payment" ? "支付" : log.category === "api" ? "API" : "密匙"}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--page-heading)" }}>
                    {log.action === "register" ? "注册" : log.action === "login" ? "登录" : log.action === "api_call" ? "API 调用" : log.action === "recharge_order" ? "充值订单" : log.action === "recharge_approved" ? "充值到账" : log.action === "redeem_code" ? "激活码兑换" : log.action === "create_key" ? "创建 API Key" : log.action}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--page-text)" }}>{log.detail || "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--page-subtle)", marginTop: 2 }}>{log.email || log.customerId?.slice(0, 12) || "—"}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: log.amount ? "#6366f1" : "#888", textAlign: "right" }}>
                    {log.amount != null ? `¥ ${Number(log.amount).toFixed(2)}` : "—"}
                  </span>
                  <div style={{ fontSize: 11, color: "var(--page-sub)", textAlign: "right" }}>
                    <div>{formatDate(log.createdAt)}</div>
                    {log.ip && <div style={{ color: "#bbb", marginTop: 2 }}>{log.ip}</div>}
                  </div>
                </div>
              ))}
              {!logs.length && (
                <div style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 16, padding: 36, textAlign: "center", color: "var(--page-subtle)", fontWeight: 700 }}>
                  暂无日志
                </div>
              )}
            </div>

            {logTotal > 50 && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button className="btn-secondary" disabled={logPage === 0} onClick={() => { const p = logPage - 1; setLogPage(p); loadLogs(secret, logCategory, logAction, p); }}>
                  上一页
                </button>
                <span style={{ display: "flex", alignItems: "center", fontSize: 13, color: "var(--page-sub)" }}>
                  第 {logPage + 1} 页 / 共 {Math.ceil(logTotal / 50)} 页
                </span>
                <button className="btn-secondary" disabled={(logPage + 1) * 50 >= logTotal} onClick={() => { const p = logPage + 1; setLogPage(p); loadLogs(secret, logCategory, logAction, p); }}>
                  下一页
                </button>
              </div>
            )}
          </div>
        )}
      </ConsoleLayout>
    </>
  );
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatPayment(value) {
  if (value === "wechat") return "微信";
  if (value === "alipay") return "支付宝";
  if (value === "taobao") return "淘宝激活码";
  return value || "未知方式";
}
