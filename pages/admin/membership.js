import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

export default function AdminMembershipPage() {
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [toast, setToast] = useState("");

  const loadData = useCallback(async () => {
    const res = await fetch("/api/admin/membership");
    const json = await res.json();
    if (res.ok) {
      setData(json);
      setConfig(json.config);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadData);
  }, [loadData]);

  function showToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  }

  async function saveConfig() {
    const res = await fetch("/api/admin/membership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "config", config }),
    });
    if (res.ok) {
      showToast("会员配置已保存");
      loadData();
    } else {
      showToast("保存失败");
    }
  }

  async function grant(userId) {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    const res = await fetch("/api/admin/membership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "grant", userId, membership: { status: "active", startedAt: now.toISOString(), expiresAt: expiresAt.toISOString() } }),
    });
    if (res.ok) {
      showToast("已开通黑金会员");
      loadData();
    } else {
      showToast("开通失败");
    }
  }

  return (
    <>
      <Head><title>会员管理 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/membership">
        <div className="admin-page-head">
          <div>
            <p className="admin-page-kicker">Membership</p>
            <h1>FLOWAPI 黑金会员管理</h1>
            <p className="admin-page-sub">配置每日赠送 Token、会员价格、免费模型广场权益和用户会员状态。</p>
          </div>
          {toast ? <span className="admin-toast-inline">{toast}</span> : null}
        </div>

        <section className="admin-membership-grid">
          <div className="admin-membership-card">
            <h2>会员等级配置</h2>
            <label><span>会员名称</span><input value={config?.name || ""} onChange={(event) => setConfig({ ...config, name: event.target.value })} /></label>
            <label><span>会员价格 ¥</span><input type="number" value={config?.priceCny || 0} onChange={(event) => setConfig({ ...config, priceCny: Number(event.target.value) })} /></label>
            <label><span>周期</span><select value={config?.period || "month"} onChange={(event) => setConfig({ ...config, period: event.target.value })}><option value="week">周</option><option value="month">月</option><option value="year">年</option></select></label>
            <label><span>每日赠送 Token</span><input type="number" value={config?.dailyBonusTokens || 0} onChange={(event) => setConfig({ ...config, dailyBonusTokens: Number(event.target.value) })} /></label>
            <label><span>会员专属额度 Token</span><input type="number" value={config?.memberQuotaTokens || 0} onChange={(event) => setConfig({ ...config, memberQuotaTokens: Number(event.target.value) })} /></label>
            <label className="admin-membership-check"><input type="checkbox" checked={config?.freeModelMarketAccess !== false} onChange={(event) => setConfig({ ...config, freeModelMarketAccess: event.target.checked })} /><span>开启免费模型广场权限</span></label>
            <button type="button" className="btn-primary" onClick={saveConfig}>保存会员配置</button>
          </div>

          <div className="admin-membership-card">
            <h2>用户会员状态</h2>
            <div className="admin-membership-users">
              {(data?.users || []).map((user) => (
                <article key={user.id}>
                  <div>
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                    <small>{user.membership?.status === "active" ? `黑金会员 · 到期 ${new Date(user.membership.expiresAt).toLocaleDateString("zh-CN")}` : "未开通会员"}</small>
                  </div>
                  <button type="button" onClick={() => grant(user.id)}>开通 1 个月</button>
                </article>
              ))}
            </div>
          </div>
        </section>
      </AdminLayout>
    </>
  );
}
