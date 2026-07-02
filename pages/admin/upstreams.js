import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const EMPTY = {
  name: "",
  type: "OpenAI Compatible",
  baseUrl: "",
  apiKey: "",
  protocol: "/v1/models",
  status: "draft",
  latencyMs: 0,
  lastError: "",
  lastErrorRequestId: "",
  lastErrorStatusCode: 0,
  lastErrorAt: "",
  lastPaymentRequired: false,
  lastUpstreamUrl: "",
  lastApiKeyPreview: "",
  remark: "",
  enabled: true,
};

function badgeColor(status) {
  if (status === "active") return "#16a34a";
  if (status === "disabled") return "#ef4444";
  if (status === "error") return "#f97316";
  return "#94a3b8";
}

function fmt(value) {
  return value || "-";
}

export default function AdminUpstreamsPage() {
  const [secret, setSecret] = useState(() => (typeof window === "undefined" ? "" : sessionStorage.getItem("flowapi_admin_secret") || ""));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");

  async function load(nextSecret = secret) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/upstreams", {
        headers: nextSecret ? { "x-admin-secret": nextSecret } : {},
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "加载上游失败");
      setRows(Array.isArray(json.upstreams) ? json.upstreams : []);
    } catch (err) {
      setError(err.message || "加载上游失败");
    }
    setLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving("save");
    setError("");
    try {
      const response = await fetch("/api/admin/upstreams", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(secret ? { "x-admin-secret": secret } : {}),
        },
        body: JSON.stringify(form),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "保存失败");
      setEditing(null);
      setForm(EMPTY);
      await load();
    } catch (err) {
      setError(err.message || "保存失败");
    }
    setSaving("");
  }

  async function runTest(id) {
    setSaving(id);
    setError("");
    try {
      const response = await fetch(`/api/admin/upstreams/${id}/test`, {
        method: "POST",
        headers: secret ? { "x-admin-secret": secret } : {},
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || json.message || "测试失败");
      await load();
    } catch (err) {
      setError(err.message || "测试失败");
    }
    setSaving("");
  }

  return (
    <>
      <Head><title>上游渠道 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/upstreams">
        <main className="page">
          <header className="hero">
            <div>
              <span>UPSTREAMS</span>
              <h1>上游渠道管理</h1>
              <p>这里直接管理 `upstream_providers`，保存后会记录最近一次 402、request_id、上游地址和脱敏后的 API Key 预览。</p>
            </div>
            <div className="actions">
              <input value={secret} onChange={(e) => setSecret(e.target.value)} onBlur={() => sessionStorage.setItem("flowapi_admin_secret", secret)} type="password" placeholder="管理密钥" />
              <button type="button" onClick={() => load(secret)}>{loading ? "读取中..." : "刷新"}</button>
            </div>
          </header>

          <section className="card">
            <div className="topbar">
              <strong>{editing ? "编辑上游" : "新增上游"}</strong>
              <button type="button" onClick={() => { setEditing(null); setForm(EMPTY); }}>重置</button>
            </div>
            <div className="grid">
              {[
                ["name", "名称"],
                ["type", "类型"],
                ["baseUrl", "Base URL"],
                ["apiKey", "API Key"],
                ["protocol", "协议"],
                ["remark", "备注"],
              ].map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input value={form[key] || ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                </label>
              ))}
            </div>
            <div className="footer">
              <label><span>启用</span><input type="checkbox" checked={form.enabled !== false} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /></label>
              <button type="button" onClick={save} disabled={saving === "save"}>{saving === "save" ? "保存中..." : "保存"}</button>
            </div>
          </section>

          {error ? <div className="error">{error}</div> : null}

          <section className="card table-card">
            {loading ? <p>正在读取上游列表...</p> : null}
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>状态</th>
                  <th>最近错误</th>
                  <th>最近 402 时间</th>
                  <th>request_id</th>
                  <th>密钥预览</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="name">{row.name}</div>
                      <div className="sub">{row.baseUrl}</div>
                    </td>
                    <td><span className="pill" style={{ color: badgeColor(row.status), borderColor: badgeColor(row.status) }}>{row.status || "draft"}</span></td>
                    <td>
                      <div className="sub">{fmt(row.lastError)}</div>
                      <div className="sub">{row.lastPaymentRequired ? "402 Payment Required" : fmt(row.lastErrorStatusCode)}</div>
                    </td>
                    <td>{fmt(row.lastErrorAt)}</td>
                    <td className="mono">{fmt(row.lastErrorRequestId)}</td>
                    <td className="mono">{fmt(row.lastApiKeyPreview)}</td>
                    <td>
                      <div className="ops">
                        <button type="button" onClick={() => { setEditing(row.id); setForm(row); }}>编辑</button>
                        <button type="button" onClick={() => runTest(row.id)} disabled={saving === row.id}>{saving === row.id ? "测试中..." : "测试"}</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 ? <tr><td colSpan={7}>暂无上游配置</td></tr> : null}
              </tbody>
            </table>
          </section>

          <section className="card">
            <strong>说明</strong>
            <p>API Key 只显示预览值，完整 Key 不会回显。402 的 request_id 和时间会写进最近错误列，方便你直接追到是哪条上游在耗尽余额。</p>
            <Link href="/admin/upstream-status">查看上游状态页</Link>
          </section>
        </main>
      </AdminLayout>
      <style jsx>{`
        .page { display: grid; gap: 16px; color: var(--dash-text); }
        .hero, .card { border: 1px solid var(--dash-border); background: var(--dash-card-bg); border-radius: 14px; padding: 18px 20px; }
        .hero { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
        .hero span { color: var(--dash-accent); font-size: 11px; font-weight: 900; letter-spacing: .08em; }
        h1 { margin: 6px 0 0; font-size: 28px; font-weight: 950; }
        .hero p, .sub, .card p { margin: 8px 0 0; color: var(--dash-sub); font-size: 13px; line-height: 1.6; }
        .actions { display: flex; gap: 8px; }
        input { min-height: 40px; border-radius: 10px; border: 1px solid var(--dash-border); background: var(--dash-card-bg); color: var(--dash-text); padding: 0 12px; }
        button, a { border: 0; border-radius: 10px; min-height: 40px; padding: 0 14px; cursor: pointer; background: linear-gradient(135deg,#6366f1,#8b5cf6); color: #fff; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
        .card { display: grid; gap: 12px; }
        .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        label { display: grid; gap: 6px; }
        label span { font-size: 12px; font-weight: 800; color: var(--dash-sub); }
        .footer, .topbar, .ops { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
        .footer label { display: flex; align-items: center; gap: 8px; }
        .table-card { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; min-width: 1100px; }
        th, td { padding: 12px 10px; border-top: 1px solid var(--dash-border); text-align: left; vertical-align: top; }
        th { color: var(--dash-sub); font-size: 11px; }
        .name { font-weight: 900; }
        .mono { font-family: "SFMono-Regular", ui-monospace, monospace; font-size: 12px; word-break: break-all; }
        .pill { border: 1px solid; border-radius: 999px; padding: 4px 8px; font-size: 11px; font-weight: 900; }
        .error { border: 1px solid rgba(239,68,68,.25); background: rgba(239,68,68,.1); color: #ef4444; border-radius: 12px; padding: 12px; font-weight: 800; }
        @media (max-width: 900px) { .hero, .actions, .grid { grid-template-columns: 1fr; display: grid; } }
      `}</style>
    </>
  );
}
