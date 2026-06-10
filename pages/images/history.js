import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import ImageLogCard from "@/components/images/image-log-card";

export default function ImagesHistoryPage() {
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
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
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
    async function loadHistory() {
      setLoading(true);
      const params = new URLSearchParams({ limit: "50" });
      if (status) params.set("status", status);
      if (requestId.trim()) params.set("requestId", requestId.trim());
      const response = await fetch(`/api/images/history?${params.toString()}`);
      const json = await response.json();
      if (!cancelled) {
        setItems(Array.isArray(json.items) ? json.items : []);
        setLoading(false);
      }
    }
    loadHistory();
    return () => { cancelled = true; };
  }, [status, requestId]);

  async function copyLink(value) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
  }

  return (
    <>
      <Head><title>图片历史 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }} currentPath="/images">
        <main className="image-history-page">
          <section className="image-history-head">
            <div>
              <span>Image History</span>
              <h1>图片历史</h1>
              <p>这里只展示你自己的图片记录。队长查看成员历史，需要从团队记账进入成员明细。</p>
            </div>
            <div className="image-logs-controls">
              <div className="image-history-filters">
                <button type="button" className={!status ? "active" : ""} onClick={() => setStatus("")}>全部</button>
                <button type="button" className={status === "success" ? "active" : ""} onClick={() => setStatus("success")}>成功</button>
                <button type="button" className={status === "failed" ? "active" : ""} onClick={() => setStatus("failed")}>失败</button>
              </div>
              <div className="image-logs-search">
                <input
                  type="text"
                  value={requestId}
                  onChange={(event) => updateRequestId(event.target.value.trim())}
                  placeholder="按 request_id 定位单次记录"
                />
                {requestId ? (
                  <button type="button" onClick={() => updateRequestId("")}>
                    清除
                  </button>
                ) : null}
              </div>
            </div>
          </section>
          {loading ? <div className="image-studio-empty">正在加载历史...</div> : null}
          <div className="image-history-grid">
            {items.map((item) => (
              <ImageLogCard key={item.id} item={item} compact onCopyLink={copyLink} />
            ))}
          </div>
        </main>
      </ConsoleLayout>
    </>
  );
}
