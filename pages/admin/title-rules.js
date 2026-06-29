export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const CATEGORIES = ["asset", "token", "model", "image", "payment", "invite", "team", "membership", "data", "stability", "developer"];

function categoryLabel(key) {
  return {
    asset: "资产",
    token: "Token",
    model: "模型",
    image: "图片",
    payment: "支付",
    invite: "邀请",
    team: "团队",
    membership: "会员",
    data: "数据",
    stability: "稳定性",
    developer: "开发者",
  }[key] || key;
}

export default function AdminTitleRules() {
  const [rules, setRules] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    queueMicrotask(() => fetchRules());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchRules() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/title-rules");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setRules(data.rules || []);
      setMetrics(data.metrics || []);
    } catch (error) {
      setMessage(error.message || "加载失败");
    }
    setLoading(false);
  }

  async function updateRule(ruleKey, patch) {
    const res = await fetch("/api/admin/title-rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "updateRule", ruleKey, patch }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "更新失败");
      return;
    }
    setRules((prev) => prev.map((rule) => rule.ruleKey === ruleKey ? { ...rule, ...patch } : rule));
  }

  async function recalculateAll() {
    setMessage("正在重算全站称号...");
    const res = await fetch("/api/admin/title-rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "recalculateAll" }),
    });
    const data = await res.json();
    setMessage(res.ok ? `已重算 ${data.count || 0} 个用户` : (data.error || "重算失败"));
  }

  const groupedRules = useMemo(() => CATEGORIES.map((category) => ({
    category,
    rules: rules.filter((rule) => rule.category === category),
  })).filter((group) => group.rules.length), [rules]);

  return (
    <>
      <Head><title>称号规则 - FlowAPI 管理后台</title></Head>
      <AdminLayout currentPath="/admin/title-rules">
        <main className="admin-title-rules-page">
          <header className="admin-title-rules-hero">
            <div>
              <span>FlowAPI Honors Engine</span>
              <h1>称号规则引擎</h1>
              <p>根据真实调用、充值、图片生成、邀请返佣和 API Key 配置自动授予称号。新增功能只要注册指标，就能进入排行体系。</p>
            </div>
            <div className="admin-title-rules-actions">
              <button type="button" onClick={() => fetchRules()}>刷新</button>
              <button type="button" onClick={recalculateAll}>全站重算</button>
            </div>
          </header>

          <section className="admin-title-rules-metrics">
            <article><span>已注册指标</span><strong>{metrics.length}</strong></article>
            <article><span>已启用规则</span><strong>{rules.filter((rule) => rule.enabled !== false).length}</strong></article>
            <article><span>称号分类</span><strong>{groupedRules.length}</strong></article>
          </section>

          {message ? <div className="admin-title-rules-message">{message}</div> : null}
          {loading ? <div className="admin-title-rules-empty">加载称号规则中...</div> : null}

          <section className="admin-title-rules-list">
            {groupedRules.map((group) => (
              <div key={group.category} className="admin-title-rules-group">
                <h2>{categoryLabel(group.category)}</h2>
                <div className="admin-title-rules-table">
                  {group.rules.map((rule) => (
                    <article key={rule.ruleKey}>
                      <div>
                        <strong>{rule.metricName}</strong>
                        <span>{rule.ruleKey}</span>
                      </div>
                      <select value={rule.category} onChange={(event) => updateRule(rule.ruleKey, { category: event.target.value })}>
                        {CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}
                      </select>
                      <label>
                        Top
                        <input type="number" min="1" max="20" value={rule.topRankLimit || 10} onChange={(event) => updateRule(rule.ruleKey, { topRankLimit: Number(event.target.value || 10) })} />
                      </label>
                      <button type="button" className={rule.enabled === false ? "" : "is-on"} onClick={() => updateRule(rule.ruleKey, { enabled: rule.enabled === false })}>
                        {rule.enabled === false ? "已停用" : "已启用"}
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </main>
      </AdminLayout>
    </>
  );
}
