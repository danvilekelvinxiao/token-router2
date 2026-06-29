import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import { formatApiMoneyPrecise, formatToken } from "@/lib/format/number-format";

const TABS = [
  { id: "all", label: "全部" },
  { id: "recharge", label: "充值" },
  { id: "consume", label: "消费" },
  { id: "purchase", label: "购买记录" },
  { id: "withdraw", label: "提款" },
  { id: "refund", label: "退款" },
  { id: "image", label: "图片" },
  { id: "failed", label: "失败" },
];

export default function DashboardLogsPage() {
  const router = useRouter();
  const [customer] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("flowapi_customer");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [items, setItems] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [filters, setFilters] = useState({
    type: "all",
    apiKeyId: "",
    model: "",
    group: "",
    status: "",
    startDate: "",
    endDate: "",
    minAmount: "",
    maxAmount: "",
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const requestId = router.isReady && typeof router.query.requestId === "string" ? router.query.requestId : "";

  function updateRequestId(nextValue) {
    const nextQuery = { ...router.query };
    if (nextValue) {
      nextQuery.requestId = nextValue;
    } else {
      delete nextQuery.requestId;
    }
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true, scroll: false });
  }

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function buildParams() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "all") params.set(key, value);
    });
    if (requestId.trim()) params.set("requestId", requestId.trim());
    return params;
  }

  useEffect(() => {
    let cancelled = false;
    async function loadLogs() {
      setLoading(true);
      try {
        const params = buildParams();
        const response = await fetch(`/api/usage-logs${params.toString() ? `?${params.toString()}` : ""}`);
        const json = await response.json();
        if (!cancelled) {
          setItems(Array.isArray(json.items) ? json.items : []);
          setApiKeys(Array.isArray(json.apiKeys) ? json.apiKeys : []);
        }
      } catch {
        if (!cancelled) setMessage("日志加载失败，请刷新后重试。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadLogs();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, requestId]);

  function filenameFromDisposition(disposition) {
    const encoded = String(disposition || "").match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    return encoded ? decodeURIComponent(encoded) : `FlowAPI_使用日志_${Date.now()}.xlsx`;
  }

  async function exportCurrentLogs() {
    setExporting(true);
    setMessage("正在生成 Excel...");
    try {
      const params = buildParams();
      const response = await fetch(`/api/usage-logs/export${params.toString() ? `?${params.toString()}` : ""}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "导出失败，请稍后重试。");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameFromDisposition(response.headers.get("content-disposition"));
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setMessage("Excel 已生成并开始下载。");
    } catch (error) {
      setMessage(error.message || "导出失败，请稍后重试。");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Head><title>使用日志 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }} currentPath="/dashboard/logs">
        <main className="image-logs-page">
          <section className="image-history-head">
            <div>
              <span>Usage Logs</span>
              <h1>使用日志</h1>
              <p>普通用户只能看自己的充值、消费、图片、购买、提款、退款和失败记录。</p>
            </div>
            <div className="image-logs-controls">
              <div className="image-history-filters">
                {TABS.map((item) => (
                  <button key={item.id} type="button" className={filters.type === item.id ? "active" : ""} onClick={() => updateFilter("type", item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="image-logs-search">
                <input
                  type="text"
                  value={requestId}
                  onChange={(event) => updateRequestId(event.target.value.trim())}
                  placeholder="输入 request_id 快速定位"
                />
                {requestId ? (
                  <button type="button" onClick={() => updateRequestId("")}>
                    清除
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="usage-log-filter-panel">
            <div className="usage-log-filter-grid">
              <label>
                <span>API Key</span>
                <select value={filters.apiKeyId} onChange={(event) => updateFilter("apiKeyId", event.target.value)}>
                  <option value="">全部 API Key</option>
                  {apiKeys.map((key) => (
                    <option key={key.id} value={key.id}>{key.label} · {key.masked}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>模型</span>
                <input value={filters.model} onChange={(event) => updateFilter("model", event.target.value)} placeholder="模型名称 / ID" />
              </label>
              <label>
                <span>分组</span>
                <input value={filters.group} onChange={(event) => updateFilter("group", event.target.value)} placeholder="分组名称" />
              </label>
              <label>
                <span>状态</span>
                <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
                  <option value="">全部状态</option>
                  <option value="成功">成功</option>
                  <option value="失败">失败</option>
                  <option value="待处理">待处理</option>
                  <option value="已退款">已退款</option>
                </select>
              </label>
              <label>
                <span>开始日期</span>
                <input type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} />
              </label>
              <label>
                <span>结束日期</span>
                <input type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} />
              </label>
              <label>
                <span>最小消费金额</span>
                <input type="number" value={filters.minAmount} onChange={(event) => updateFilter("minAmount", event.target.value)} placeholder="$ API 0.00" />
              </label>
              <label>
                <span>最大消费金额</span>
                <input type="number" value={filters.maxAmount} onChange={(event) => updateFilter("maxAmount", event.target.value)} placeholder="$ API 999.00" />
              </label>
            </div>
            <div className="usage-log-filter-actions">
              <button type="button" onClick={() => setFilters({ type: "all", apiKeyId: "", model: "", group: "", status: "", startDate: "", endDate: "", minAmount: "", maxAmount: "" })}>
                重置筛选
              </button>
              <button type="button" className="primary" onClick={exportCurrentLogs} disabled={exporting}>
                {exporting ? "正在生成 Excel..." : "导出当前筛选 Excel"}
              </button>
            </div>
            {message ? <p className="usage-log-filter-message">{message}</p> : null}
          </section>

          <div className="image-logs-table-wrap">
            {loading ? <div className="image-studio-empty">正在加载日志...</div> : null}
            {!loading ? (
              <table className="image-logs-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>请求 ID</th>
                    <th>API Key</th>
                    <th>模型</th>
                    <th>类型</th>
                    <th>分组</th>
                    <th>消耗 Token</th>
                    <th>消耗金额</th>
                    <th>状态</th>
                    <th>耗时</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                      <td>{item.id}</td>
                      <td>{item.apiKeyLabel ? `${item.apiKeyLabel} · ${item.apiKeyMasked}` : "-"}</td>
                      <td>{item.model || "-"}</td>
                      <td>{TABS.find((entry) => entry.id === item.type)?.label || item.type}</td>
                      <td>{item.group || "-"}</td>
                      <td>{formatToken(item.totalTokens, { compact: false })}</td>
                      <td>{formatApiMoneyPrecise(item.moneyCost || 0)}</td>
                      <td>{item.status}</td>
                      <td>{item.latencyMs ? `${item.latencyMs} ms` : "-"}</td>
                      <td><a href={item.type === "image" || item.id?.startsWith("img_") ? `/images/history?requestId=${encodeURIComponent(item.id)}` : `/dashboard?callId=${encodeURIComponent(item.id || "")}`}>查看</a></td>
                    </tr>
                  ))}
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="usage-log-zero-row">
                        <div className="usage-log-empty-state">
                          <strong>还没有扣费日志</strong>
                          <p>完成一次模型调用后，这里会显示 Token、金额、状态和 request_id。现在可以去复制教程跑通第一次调用。</p>
                          <div>
                            <Link href="/api-management">创建 API Key</Link>
                            <Link href="/help">查看三步教程</Link>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            ) : null}
          </div>
        </main>
      </ConsoleLayout>
    </>
  );
}
