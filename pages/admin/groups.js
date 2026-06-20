import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const emptyForm = {
  id: "",
  displayName: "",
  sortOrder: 100,
  billingMultiplier: "1",
  description: "",
  available: true,
  recommended: false,
  discountStackable: true,
  supportedModelsText: "",
  status: "active",
  newApiGroup: "",
  channelStrategy: "auto",
};

function toForm(group = {}) {
  return {
    id: group.id || "",
    displayName: group.displayName || "",
    sortOrder: Number.isFinite(Number(group.sortOrder)) ? Number(group.sortOrder) : 100,
    billingMultiplier: String(group.billingMultiplier ?? 1),
    description: group.description || "",
    available: group.available !== false,
    recommended: Boolean(group.recommended),
    discountStackable: group.discountStackable !== false,
    supportedModelsText: (group.supportedModels || []).join("\n"),
    status: group.status || "active",
    newApiGroup: group.newApiGroup || group.id || "",
    channelStrategy: group.channelStrategy || "auto",
  };
}

function parseModels(text = "") {
  return String(text || "")
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [models, setModels] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const recommendedGroup = useMemo(() => groups.find((group) => group.recommended), [groups]);

  function showToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/groups");
      const data = await res.json().catch(() => ({}));
      setGroups(data.groups || []);
      setModels(data.models || []);
      if (!form.id && data.groups?.[0]) setForm(toForm(data.groups[0]));
    } catch {
      showToast("分组配置加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
        loadData();
      }, []);

  async function saveGroup() {
    if (!form.id.trim()) {
      showToast("请填写分组 ID");
      return;
    }
    if (!form.displayName.trim()) {
      showToast("请填写前台显示名称");
      return;
    }
    const multiplier = Number(form.billingMultiplier);
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      showToast("倍率必须大于 0");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          name: form.id,
          displayName: form.displayName,
          billingMultiplier: multiplier,
          sortOrder: Number(form.sortOrder || 100),
          description: form.description,
          available: form.available,
          recommended: form.recommended,
          discountStackable: form.discountStackable,
          supportedModels: parseModels(form.supportedModelsText),
          status: form.status,
          newApiGroup: form.newApiGroup || form.id,
          channelStrategy: form.channelStrategy,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "保存失败");
      showToast(data.message || "分组已保存");
      await loadData();
    } catch (error) {
      showToast(error.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup(group) {
    if (group.id === "default") {
      showToast("默认分组不能删除，可以改为停用。");
      return;
    }
    if (!window.confirm(`确认删除 ${group.displayName} 分组？`)) return;
    await fetch("/api/admin/groups", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: group.id }),
    });
    showToast("分组已删除");
    await loadData();
  }

  return (
    <>
      <Head><title>API 分组管理 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/groups">
        <div className="redeem-admin-page">
          <header className="redeem-admin-header">
            <div>
              <h1>API 分组管理</h1>
              <p>配置创建 API Key 时可选择的分组、计费倍率、New API 分组和模型权限。</p>
            </div>
            <button type="button" className="redeem-btn primary" onClick={() => setForm(emptyForm)}>
              新增分组
            </button>
          </header>

          {loading ? (
            <p style={{ color: "var(--dash-sub)", padding: 24 }}>加载中...</p>
          ) : (
            <div className="admin-groups-layout">
              <section className="admin-groups-list" aria-label="已配置分组">
                {groups.map((group) => (
                  <article key={group.id} className={`admin-group-card ${form.id === group.id ? "active" : ""}`}>
                    <button type="button" onClick={() => setForm(toForm(group))}>
                      <span>
                        <strong>{group.displayName}</strong>
                        <small>{group.id} · New API: {group.newApiGroup || group.id} · 顺序 {group.sortOrder ?? 100}</small>
                      </span>
                      <em>{group.billingMultiplier}x</em>
                    </button>
                    <p>{group.description || "暂无说明"}</p>
                    <div>
                      {group.recommended ? <span>系统推荐</span> : null}
                      {group.available ? <span>已启用</span> : <span>已停用</span>}
                      {group.discountStackable ? <span>可叠加优惠</span> : <span>不叠加优惠</span>}
                      <span>{group.supportedModels?.length ? `${group.supportedModels.length} 个模型` : "全部模型"}</span>
                    </div>
                    <footer>
                      <button type="button" onClick={() => setForm(toForm(group))}>编辑</button>
                      <button type="button" className="danger" onClick={() => deleteGroup(group)}>删除</button>
                    </footer>
                  </article>
                ))}
              </section>

              <section className="admin-group-editor">
                <div className="admin-group-editor-head">
                  <div>
                    <span>GROUP CONFIG</span>
                    <h2>{form.id ? "编辑分组" : "新增分组"}</h2>
                  </div>
                  {recommendedGroup ? <em>当前推荐：{recommendedGroup.displayName}</em> : null}
                </div>

                <label>分组 ID
                  <input value={form.id} onChange={(event) => setForm((current) => ({ ...current, id: event.target.value }))} placeholder="official" />
                </label>
                <label>前台显示名称
                  <input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="官方" />
                </label>
                <label>计费倍率
                  <input type="number" min="0.01" step="0.01" value={form.billingMultiplier} onChange={(event) => setForm((current) => ({ ...current, billingMultiplier: event.target.value }))} />
                </label>
                <label>显示顺序
                  <input type="number" min="0" step="1" value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))} />
                </label>
                <label>New API 分组
                  <input value={form.newApiGroup} onChange={(event) => setForm((current) => ({ ...current, newApiGroup: event.target.value }))} placeholder="default" />
                </label>
                <label>分组说明
                  <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} placeholder="给前台用户看的选择说明" />
                </label>
                <label>支持模型
                  <textarea value={form.supportedModelsText} onChange={(event) => setForm((current) => ({ ...current, supportedModelsText: event.target.value }))} rows={5} placeholder="留空表示支持全部模型；也可逐行填 public_model_id" />
                  <small>可用模型示例：{models.slice(0, 4).map((model) => model.publicModelId).join(" / ") || "模型同步中"}</small>
                </label>

                <div className="admin-group-switches">
                  <label><input type="checkbox" checked={form.available} onChange={(event) => setForm((current) => ({ ...current, available: event.target.checked }))} /> 启用</label>
                  <label><input type="checkbox" checked={form.recommended} onChange={(event) => setForm((current) => ({ ...current, recommended: event.target.checked }))} /> 系统推荐</label>
                  <label><input type="checkbox" checked={form.discountStackable} onChange={(event) => setForm((current) => ({ ...current, discountStackable: event.target.checked }))} /> 可叠加优惠</label>
                </div>

                <div className="admin-group-editor-actions">
                  <button type="button" className="redeem-btn secondary" onClick={() => setForm(emptyForm)}>清空</button>
                  <button type="button" className="redeem-btn primary flowapi-primary-action" onClick={saveGroup} disabled={saving}>
                    {saving ? "保存中..." : "保存分组"}
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>

        {toast ? <div className="models-toast" style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}>{toast}</div> : null}
      </AdminLayout>
    </>
  );
}
