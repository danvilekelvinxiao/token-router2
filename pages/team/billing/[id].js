import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import ImageLogCard from "@/components/images/image-log-card";

export default function TeamMemberBillingDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [customer] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("flowapi_customer");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function loadMember() {
      const response = await fetch(`/api/team/billing/member/${encodeURIComponent(id)}`);
      const json = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setError(json.error || "暂无权限查看成员明细");
        return;
      }
      setData(json);
    }
    loadMember();
    return () => { cancelled = true; };
  }, [id]);

  async function copyLink(value) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
  }

  return (
    <>
      <Head><title>成员明细 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }} currentPath="/team/billing">
        <main className="team-billing-page">
          <section className="image-history-head">
            <div>
              <span>Member Billing</span>
              <h1>{data?.member?.memberName || "成员"} 图片生成明细</h1>
              <p>这里只展示该成员的图片生成记录、扣费和失败情况，其他成员无权查看。</p>
            </div>
          </section>

          {error ? <div className="image-studio-error-box">{error}</div> : null}
          {data?.summary ? (
            <section className="team-billing-summary">
              <article><span>累计生成任务</span><strong>{data.summary.totalGenerations}</strong></article>
              <article><span>累计生成图片数</span><strong>{data.summary.totalImages}</strong></article>
              <article><span>累计 Token 消耗</span><strong>{Number(data.summary.totalTokens || 0).toFixed(1)}</strong></article>
              <article><span>累计金额消耗</span><strong>${Number(data.summary.totalMoney || 0).toFixed(2)}</strong></article>
              <article><span>成功率</span><strong>{Number(data.summary.successRate || 0).toFixed(1)}%</strong></article>
              <article><span>最常用模型</span><strong>{data.summary.topModel || "暂无"}</strong></article>
            </section>
          ) : null}

          <div className="image-history-grid">
            {(data?.items || []).map((item) => (
              <ImageLogCard key={item.id} item={item} onCopyLink={copyLink} compact />
            ))}
          </div>
        </main>
      </ConsoleLayout>
    </>
  );
}
