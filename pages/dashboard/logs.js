import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";

const TABS = [
  { id: "", label: "全部" },
  { id: "text_to_image", label: "图片生成" },
  { id: "image_to_image", label: "图片编辑" },
  { id: "failed", label: "失败记录" },
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
  const [tab, setTab] = useState("");
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    let cancelled = false;
    async function loadLogs() {
      setLoading(true);
      const params = new URLSearchParams();
      if (tab === "failed") {
        params.set("status", "failed");
      } else if (tab) {
        params.set("type", tab);
      }
      if (requestId.trim()) {
        params.set("requestId", requestId.trim());
      }
      const response = await fetch(`/api/logs/images${params.toString() ? `?${params.toString()}` : ""}`);
      const json = await response.json();
      if (!cancelled) {
        setItems(Array.isArray(json.items) ? json.items : []);
        setLoading(false);
      }
    }
    loadLogs();
    return () => { cancelled = true; };
  }, [tab, requestId]);

  function getStatusLabel(status) {
    if (status === "success") return "成功";
    if (status === "partial_success") return "部分成功";
    if (status === "retrying") return "重试中";
    return "失败";
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
              <p>普通用户只能看自己的图片生成、扣费和失败记录。</p>
            </div>
            <div className="image-logs-controls">
              <div className="image-history-filters">
                {TABS.map((item) => (
                  <button key={item.id || "all"} type="button" className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
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

          <div className="image-logs-table-wrap">
            {loading ? <div className="image-studio-empty">正在加载日志...</div> : null}
            {!loading ? (
              <table className="image-logs-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>请求 ID</th>
                    <th>模型</th>
                    <th>类型</th>
                    <th>输出张数</th>
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
                      <td>{item.requestId}</td>
                      <td>{item.modelDisplayName}</td>
                      <td>{item.mode === "image_to_image" ? "图生图 / 改图" : "文生图"}</td>
                      <td>{item.outputImageCount}</td>
                      <td>{Number(item.tokenCost || 0).toFixed(1)}</td>
                      <td>￥{Number(item.moneyCost || 0).toFixed(2)}</td>
                      <td>{getStatusLabel(item.status)}</td>
                      <td>{item.latencyMs} ms</td>
                      <td><a href={`/images/history?requestId=${encodeURIComponent(item.requestId)}`}>查看图片</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </main>
      </ConsoleLayout>
    </>
  );
}
