import Head from "next/head";
import { useEffect, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";

export default function TeamBillingPage() {
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
    let cancelled = false;
    async function loadTeamBilling() {
      const response = await fetch("/api/team/billing");
      const json = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setError(json.error || "暂无权限查看团队记账");
        return;
      }
      setData(json);
    }
    loadTeamBilling();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <Head><title>团队记账 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }} currentPath="/team/billing">
        <main className="team-billing-page">
          <section className="image-history-head">
            <div>
              <span>Team Billing</span>
              <h1>团队记账</h1>
              <p>仅 owner / admin 可查看团队总消耗、成员消耗和图片生成明细。</p>
            </div>
          </section>

          {error ? <div className="image-studio-error-box">{error}</div> : null}
          {data?.summary ? (
            <>
              <section className="team-billing-summary">
                <article><span>团队今日总生成数</span><strong>{data.summary.todayGenerations}</strong></article>
                <article><span>团队今日总消耗 Token</span><strong>{Number(data.summary.todayTokens || 0).toFixed(1)}</strong></article>
                <article><span>团队今日总金额</span><strong>￥{Number(data.summary.todayMoney || 0).toFixed(2)}</strong></article>
                <article><span>团队累计消耗</span><strong>￥{Number(data.summary.totalMoney || 0).toFixed(2)}</strong></article>
                <article><span>当前剩余额度</span><strong>￥{Number(data.workspace?.balance || 0).toFixed(2)}</strong></article>
                <article><span>最常用模型</span><strong>{data.summary.topModel || "暂无"}</strong></article>
              </section>

              <section className="image-logs-table-wrap">
                <table className="image-logs-table">
                  <thead>
                    <tr>
                      <th>成员名称</th>
                      <th>今日生成图片数</th>
                      <th>今日消耗 Token</th>
                      <th>今日消耗金额</th>
                      <th>累计消耗金额</th>
                      <th>最近使用时间</th>
                      <th>成功率</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.members || []).map((item) => (
                      <tr key={item.userId}>
                        <td>{item.memberName}</td>
                        <td>{item.todayImages}</td>
                        <td>{Number(item.todayTokens || 0).toFixed(1)}</td>
                        <td>￥{Number(item.todayMoney || 0).toFixed(2)}</td>
                        <td>￥{Number(item.totalMoney || 0).toFixed(2)}</td>
                        <td>{item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString("zh-CN") : "暂无"}</td>
                        <td>{Number(item.successRate || 0).toFixed(1)}%</td>
                        <td><a href={`/team/billing/${encodeURIComponent(item.userId)}`}>查看成员明细</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          ) : null}
        </main>
      </ConsoleLayout>
    </>
  );
}
