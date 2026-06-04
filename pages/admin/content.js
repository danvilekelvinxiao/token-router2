import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const TABS = [
  { key: "models", label: "大模型配置" },
  { key: "modelCategories", label: "模型分类" },
  { key: "home", label: "首页配置" },
  { key: "addonServices", label: "附加服务" },
  { key: "actions", label: "按钮配置" },
  { key: "support", label: "QQ 群 / 客服" },
  { key: "pageSettings", label: "页面开关" },
];

const MODEL_FIELDS = [
  { key: "id", label: "内容 ID", type: "text", help: "新增时可填写，保存后用于后台识别。不要和其他模型重复。" },
  { key: "displayName", label: "模型名称", type: "text" },
  { key: "provider", label: "Provider", type: "text" },
  { key: "modelId", label: "Model ID", type: "text" },
  { key: "logo", label: "Logo / Provider Key", type: "text" },
  { key: "officialReleaseDate", label: "官方发布时间", type: "text", help: "格式建议 YYYY-MM-DD；只知道月份可填 YYYY-MM；未知可留空。" },
  { key: "description", label: "描述", type: "textarea" },
  { key: "detailDescription", label: "详情介绍", type: "textarea" },
  { key: "inputPricePerM", label: "输入价格 ¥/M", type: "number" },
  { key: "outputPricePerM", label: "输出价格 ¥/M", type: "number" },
  { key: "officialInputPricePerM", label: "官方输入价格 ¥/M Token", type: "number" },
  { key: "officialOutputPricePerM", label: "官方输出价格 ¥/M Token", type: "number" },
  { key: "flowapiInputPricePerM", label: "FlowAPI 输入价格 ¥/M Token", type: "number" },
  { key: "flowapiOutputPricePerM", label: "FlowAPI 输出价格 ¥/M Token", type: "number" },
  { key: "priceUpdatedAt", label: "价格更新时间", type: "text" },
  { key: "priceNote", label: "价格备注", type: "textarea" },
  { key: "memberLevelRequired", label: "需要会员等级", type: "text" },
  { key: "memberDailyFreeLimitTokens", label: "会员每日免费额度 Token", type: "number" },
  { key: "nonMemberPrompt", label: "非会员提示文案", type: "textarea" },
  { key: "baseUrl", label: "Base URL", type: "text" },
  { key: "primaryButtonText", label: "主按钮文字", type: "text" },
  { key: "primaryButtonHref", label: "主按钮跳转", type: "text" },
  { key: "secondaryButtonText", label: "次按钮文字", type: "text" },
  { key: "secondaryButtonHref", label: "次按钮跳转", type: "text" },
  { key: "sortOrder", label: "排序", type: "number" },
];

const MODEL_BOOLEAN_FIELDS = [
  { key: "enabled", label: "上架展示" },
  { key: "showPrice", label: "显示价格" },
  { key: "includeInSavings", label: "参与节省计算" },
  { key: "isRecommended", label: "推荐模型" },
  { key: "pinned", label: "置顶排序" },
  { key: "isBeginnerFriendly", label: "新手友好" },
  { key: "isHighValue", label: "高价值模型" },
  { key: "isCodeModel", label: "代码模型" },
  { key: "isChineseFriendly", label: "中文友好" },
  { key: "isLongContext", label: "长文本" },
  { key: "isMultimodal", label: "多模态" },
  { key: "showOnHome", label: "首页展示" },
  { key: "showInBeginnerGuide", label: "新手指南展示" },
  { key: "isMemberOnly", label: "黑金会员专属" },
  { key: "isFreeModel", label: "免费模型" },
  { key: "isFreeForMember", label: "会员免费调用" },
  { key: "visibleToNonMember", label: "非会员可见" },
];

const MODEL_ARRAY_FIELDS = [
  { key: "categories", label: "分类", hint: "使用分类 ID / slug，逗号分隔，例如 recommended, gpt, code-programming" },
  { key: "tags", label: "卡片标签", hint: "最多建议 3-5 个，逗号分隔" },
  { key: "useCases", label: "适合场景", hint: "逗号分隔" },
  { key: "notRecommendedFor", label: "不适合场景", hint: "逗号分隔" },
  { key: "recommendedUserTypes", label: "推荐用户类型", hint: "逗号分隔" },
];

const MODEL_CODE_FIELDS = [
  { key: "curlExample", label: "CURL 示例" },
  { key: "pythonExample", label: "Python 示例" },
  { key: "javascriptExample", label: "JavaScript 示例" },
];

const CATEGORY_FIELDS = [
  { key: "id", label: "分类 ID", type: "text" },
  { key: "name", label: "分类名称", type: "text" },
  { key: "slug", label: "Slug", type: "text" },
  { key: "description", label: "描述", type: "textarea" },
  { key: "sortOrder", label: "排序", type: "number" },
  { key: "enabled", label: "启用", type: "checkbox" },
];

export default function AdminContentPage() {
  const [tab, setTab] = useState("models");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadTab(tab);
  }, [tab]);

  async function loadTab(t) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/content?type=${t}`);
      const json = await res.json();
      setData(json.data);
    } catch { setData(null); }
    setLoading(false);
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 2000); }

  function openEdit(item) {
    setEditing(item?.id || "new");
    setForm(item ? { ...item } : {
      id: "",
      displayName: "",
      provider: "",
      modelId: "",
      logo: "",
      officialReleaseDate: "",
      description: "",
      detailDescription: "",
      inputPricePerM: "",
      outputPricePerM: "",
      officialInputPricePerM: "",
      officialOutputPricePerM: "",
      flowapiInputPricePerM: "",
      flowapiOutputPricePerM: "",
      priceUpdatedAt: "",
      priceNote: "",
      memberLevelRequired: "",
      memberDailyFreeLimitTokens: "",
      nonMemberPrompt: "该模型为 FLOWAPI 黑金会员专属模型，开通会员后即可使用。",
      baseUrl: "https://api.flowapi.fun/v1",
      primaryButtonText: "立即接入",
      primaryButtonHref: "",
      secondaryButtonText: "复制 Model ID",
      secondaryButtonHref: "",
      sortOrder: 99,
      enabled: true,
      showPrice: true,
      includeInSavings: false,
      isMemberOnly: false,
      isFreeModel: false,
      isFreeForMember: false,
      visibleToNonMember: true,
      isRecommended: false,
      pinned: false,
      isBeginnerFriendly: false,
      categories: ["all"],
      tags: [],
      useCases: [],
      notRecommendedFor: [],
      recommendedUserTypes: [],
    });
  }

  function openCategoryEdit(item) {
    setEditing(item?.id || "new");
    setForm(item ? { ...item } : { id: "", name: "", slug: "", description: "", sortOrder: 99, enabled: true });
  }

  async function saveEdit() {
    if (!form.displayName && tab === "models") { showToast("请填写模型名称"); return; }
    const isNew = !editing || editing === "new" || !data?.find((d) => d.id === editing);
    const method = isNew ? "POST" : "PUT";
    const res = await fetch(`/api/admin/content?type=${tab}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew ? form : { id: editing, ...form }),
    });
    if (res.ok) {
      showToast(isNew ? "已创建" : "已保存");
      setEditing(null);
      loadTab(tab);
    } else {
      showToast("保存失败");
    }
  }

  async function toggleItem(id, field = "enabled") {
    await fetch(`/api/admin/content?type=${tab}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, toggle: field }),
    });
    loadTab(tab);
  }

  async function deleteItem(id) {
    if (!confirm("确认删除？")) return;
    await fetch(`/api/admin/content?type=${tab}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadTab(tab);
  }

  function renderModelTable() {
    const list = data || [];
    return (
      <div>
        <div className="content-admin-toolbar">
          <button className="redeem-btn primary" onClick={() => openEdit(null)}>新增模型</button>
          <a className="redeem-btn" href="/models" target="_blank" rel="noreferrer">打开前台模型页</a>
          <span>保存后前台刷新立即同步。价格为空时前台显示“价格同步中”。</span>
        </div>
        <div className="redeem-table-wrap">
          <table className="redeem-table">
            <thead>
              <tr>
                <th>排序</th>
                <th>模型名称</th>
                <th>Provider</th>
                <th>Model ID</th>
                <th>官方发布时间</th>
                <th>输入 ¥/M</th>
                <th>输出 ¥/M</th>
                <th>推荐</th>
                <th>上架</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td>{m.sortOrder}</td>
                  <td>
                    <strong>{m.displayName}</strong>
                    <small className="content-table-sub">{(m.tags || []).slice(0, 3).join(" / ")}</small>
                  </td>
                  <td>{m.provider}</td>
                  <td><code>{m.modelId}</code></td>
                  <td>{m.officialReleaseDate || "待确认"}</td>
                  <td>{Number(m.inputPricePerM) > 0 ? `¥${m.inputPricePerM}` : "价格同步中"}</td>
                  <td>{Number(m.outputPricePerM) > 0 ? `¥${m.outputPricePerM}` : "价格同步中"}</td>
                  <td><span style={{ color: m.isRecommended ? "#16a34a" : "#9ca3af" }}>{m.isRecommended ? "★" : "—"}</span></td>
                  <td><span style={{ color: m.enabled ? "#16a34a" : "#ef4444" }}>{m.enabled ? "已上架" : "已下架"}</span></td>
                  <td className="redeem-row-actions">
                    <button onClick={() => openEdit(m)}>编辑</button>
                    <button onClick={() => toggleItem(m.id)}>{m.enabled ? "下架" : "上架"}</button>
                    <button className="danger" onClick={() => deleteItem(m.id)}>删除</button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={10} style={{ textAlign: "center", padding: 32 }}>暂无模型</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderCategories() {
    const list = data || [];
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <button className="redeem-btn primary" onClick={() => openCategoryEdit(null)}>新增分类</button>
        </div>
        <div className="redeem-table-wrap">
          <table className="redeem-table">
            <thead><tr><th>ID</th><th>名称</th><th>Slug</th><th>排序</th><th>启用</th><th>操作</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><code>{c.id}</code></td>
                  <td>{c.name}</td>
                  <td><code>{c.slug || c.id}</code></td>
                  <td>{c.sortOrder}</td>
                  <td><span style={{ color: c.enabled ? "#16a34a" : "#ef4444" }}>{c.enabled ? "启用" : "禁用"}</span></td>
                  <td className="redeem-row-actions">
                    <button onClick={() => openCategoryEdit(c)}>编辑</button>
                    <button onClick={() => toggleItem(c.id)}>{c.enabled ? "禁用" : "启用"}</button>
                    <button className="danger" onClick={() => deleteItem(c.id)}>删除</button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: 32 }}>暂无分类</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderHomeConfig() {
    const config = data || {};
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "var(--dash-sub)", fontSize: 13, marginBottom: 16 }}>首页配置通过代码修改，当前展示只读预览。</p>
        <table className="redeem-table" style={{ maxWidth: 600 }}>
          <tbody>
            <tr><td style={{ fontWeight: 700 }}>Hero 标题</td><td>{config.heroTitle || "—"}</td></tr>
            <tr><td style={{ fontWeight: 700 }}>Hero 副标题</td><td>{config.heroSubtitle || "—"}</td></tr>
            <tr><td style={{ fontWeight: 700 }}>主按钮</td><td>{config.primaryButtonText} → {config.primaryButtonHref}</td></tr>
            <tr><td style={{ fontWeight: 700 }}>次按钮</td><td>{config.secondaryButtonText} → {config.secondaryButtonHref}</td></tr>
          </tbody>
        </table>
      </div>
    );
  }

  function renderAddonServices() {
    const list = data || [];
    return (
      <div className="redeem-table-wrap">
        <table className="redeem-table">
          <thead><tr><th>名称</th><th>价格</th><th>类型</th><th>标签</th><th>启用</th><th>操作</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.title}</strong></td>
                <td>¥{s.priceCny}/{s.unit}</td>
                <td>{s.type}</td>
                <td>{(s.tags || []).join(", ")}</td>
                <td><span style={{ color: s.enabled ? "#16a34a" : "#ef4444" }}>{s.enabled ? "启用" : "禁用"}</span></td>
                <td><button onClick={() => toggleItem(s.id)}>{s.enabled ? "禁用" : "启用"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderActions() {
    const list = data || [];
    return (
      <div className="redeem-table-wrap">
        <table className="redeem-table">
          <thead><tr><th>页面</th><th>Key</th><th>按钮文字</th><th>跳转</th><th>类型</th><th>启用</th></tr></thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td>{a.page}</td>
                <td><code>{a.key}</code></td>
                <td>{a.label}</td>
                <td>{a.href || "—"}</td>
                <td>{a.actionType}</td>
                <td><span style={{ color: a.enabled ? "#16a34a" : "#ef4444" }}>{a.enabled ? "启用" : "禁用"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderSupport() {
    const config = data || {};
    return (
      <div style={{ padding: 16 }}>
        <table className="redeem-table" style={{ maxWidth: 500 }}>
          <tbody>
            <tr><td style={{ fontWeight: 700 }}>QQ 群号</td><td>{config.qqGroupNumber || "—"}</td></tr>
            <tr><td style={{ fontWeight: 700 }}>QQ 群标题</td><td>{config.title || "—"}</td></tr>
            <tr><td style={{ fontWeight: 700 }}>QQ 群描述</td><td>{config.description || "—"}</td></tr>
            <tr><td style={{ fontWeight: 700 }}>QQ 群二维码</td><td><code>{config.qqGroupQrImage || "—"}</code></td></tr>
            <tr><td style={{ fontWeight: 700 }}>QQ 群开启</td><td>{config.qqGroupEnabled ? "是" : "否"}</td></tr>
          </tbody>
        </table>
      </div>
    );
  }

  function renderPageSettings() {
    const list = data || [];
    return (
      <div className="redeem-table-wrap">
        <table className="redeem-table">
          <thead><tr><th>页面</th><th>模块 Key</th><th>模块名称</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.moduleKey}>
                <td><code>{s.page}</code></td>
                <td><code>{s.moduleKey}</code></td>
                <td>{s.moduleName}</td>
                <td><span style={{ color: s.enabled ? "#16a34a" : "#ef4444" }}>{s.enabled ? "显示" : "隐藏"}</span></td>
                <td><button onClick={() => toggleItem(s.moduleKey)}>{s.enabled ? "隐藏" : "显示"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const tabRenderers = {
    models: renderModelTable,
    modelCategories: renderCategories,
    home: renderHomeConfig,
    addonServices: renderAddonServices,
    actions: renderActions,
    support: renderSupport,
    pageSettings: renderPageSettings,
  };

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function parseList(value) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  function renderModelField(field) {
    const disabled = field.key === "id" && editing !== "new";
    return (
      <label key={field.key} className="content-editor-field">
        <span>{field.label}</span>
        {field.type === "textarea" ? (
          <textarea rows={field.key === "detailDescription" ? 5 : 3} value={form[field.key] || ""} onChange={(event) => updateField(field.key, event.target.value)} />
        ) : (
          <input
            type={field.type}
            value={form[field.key] ?? ""}
            disabled={disabled}
            onChange={(event) => updateField(field.key, field.type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)}
          />
        )}
        {field.help ? <small>{field.help}</small> : null}
      </label>
    );
  }

  function renderModelEditor() {
    const tags = Array.isArray(form.tags) ? form.tags : [];
    const inputPrice = Number(form.flowapiInputPricePerM || form.inputPricePerM);
    const outputPrice = Number(form.flowapiOutputPricePerM || form.outputPricePerM);
    const officialInputPrice = Number(form.officialInputPricePerM);
    const officialOutputPrice = Number(form.officialOutputPricePerM);
    return (
      <div className="content-model-editor">
        <section className="content-editor-main">
          <div className="content-editor-section">
            <h3>卡片基础信息</h3>
            <div className="content-editor-grid">
              {MODEL_FIELDS.slice(0, 5).map(renderModelField)}
            </div>
          </div>

          <div className="content-editor-section">
            <h3>卡片文案与价格</h3>
            <div className="content-editor-grid">
              {MODEL_FIELDS.slice(5, 18).map(renderModelField)}
            </div>
          </div>

          <div className="content-editor-section">
            <h3>按钮与排序</h3>
            <div className="content-editor-grid">
              {MODEL_FIELDS.slice(18).map(renderModelField)}
            </div>
          </div>

          <div className="content-editor-section">
            <h3>分类、标签和适用人群</h3>
            <div className="content-editor-grid">
              {MODEL_ARRAY_FIELDS.map((field) => (
                <label key={field.key} className="content-editor-field">
                  <span>{field.label}</span>
                  <input value={(form[field.key] || []).join(", ")} onChange={(event) => updateField(field.key, parseList(event.target.value))} />
                  <small>{field.hint}</small>
                </label>
              ))}
            </div>
          </div>

          <div className="content-editor-section">
            <h3>卡片能力开关</h3>
            <div className="content-switch-grid">
              {MODEL_BOOLEAN_FIELDS.map((field) => (
                <label key={field.key}>
                  <input type="checkbox" checked={!!form[field.key]} onChange={(event) => updateField(field.key, event.target.checked)} />
                  <span>{field.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="content-editor-section">
            <h3>详情弹窗示例代码</h3>
            <div className="content-editor-grid single">
              {MODEL_CODE_FIELDS.map((field) => (
                <label key={field.key} className="content-editor-field">
                  <span>{field.label}</span>
                  <textarea rows={4} value={form[field.key] || ""} onChange={(event) => updateField(field.key, event.target.value)} />
                </label>
              ))}
            </div>
          </div>
        </section>

        <aside className="content-model-preview">
          <span>前台卡片预览</span>
          <h3>{form.displayName || "模型名称"}</h3>
          <p>by {form.provider || "Provider"}</p>
          <code>{form.modelId || "Model ID 同步中"}</code>
          <div>
            <strong>{Number.isFinite(inputPrice) && inputPrice > 0 ? `输入 ¥${inputPrice} / M Token` : "输入价格同步中"}</strong>
            <strong>{Number.isFinite(outputPrice) && outputPrice > 0 ? `输出 ¥${outputPrice} / M Token` : "输出价格同步中"}</strong>
            <strong>{Number.isFinite(officialInputPrice) && officialInputPrice > 0 && Number.isFinite(officialOutputPrice) && officialOutputPrice > 0 ? "已配置官方价格，可参与节省计算" : "官方价格同步中，暂不参与节省计算"}</strong>
          </div>
          <p>{form.description || "卡片简介会展示在这里。"}</p>
          <div className="content-preview-tags">
            {tags.slice(0, 5).map((tag) => <em key={tag}>{tag}</em>)}
            {!tags.length ? <em>标签预览</em> : null}
          </div>
          <small>{form.enabled ? "当前状态：前台展示" : "当前状态：前台隐藏"}</small>
        </aside>
      </div>
    );
  }

  return (
    <>
      <Head><title>前台内容管理 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/content">
        <div className="redeem-admin-page">
          <header className="redeem-admin-header">
            <div>
              <h1>前台内容管理</h1>
              <p>管理用户端展示的模型、价格、按钮、附加服务、公告等内容。保存后用户端自动同步。</p>
            </div>
          </header>

          {/* Tabs */}
          <div className="redeem-tabs">
            {TABS.map((t) => (
              <button key={t.key} type="button" className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>

          {/* Content */}
          {loading ? (
            <p style={{ padding: 32, color: "var(--dash-sub)" }}>加载中...</p>
          ) : (tabRenderers[tab] || (() => <p>开发中</p>))()}

          {/* Edit modal */}
          {editing && tab === "models" && (
            <div className="redeem-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
              <div className="redeem-modal content-model-modal">
                <header>
                  <h2>{editing === "new" ? "新增模型" : "编辑模型"}</h2>
                  <button onClick={() => setEditing(null)}>×</button>
                </header>
                <div className="redeem-modal-body">
                  {renderModelEditor()}
                </div>
                <footer>
                  <button className="redeem-btn" onClick={() => setEditing(null)}>取消</button>
                  <button className="redeem-btn primary" onClick={saveEdit}>保存</button>
                </footer>
              </div>
            </div>
          )}

          {editing && tab === "modelCategories" && (
            <div className="redeem-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
              <div className="redeem-modal" style={{ maxWidth: 560 }}>
                <header>
                  <h2>{editing === "new" ? "新增模型分类" : "编辑模型分类"}</h2>
                  <button onClick={() => setEditing(null)}>×</button>
                </header>
                <div className="redeem-modal-body">
                  {CATEGORY_FIELDS.map((f) => {
                    if (f.type === "checkbox") {
                      return (
                        <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                          <input type="checkbox" checked={!!form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />
                          {f.label}
                        </label>
                      );
                    }
                    return (
                      <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                        {f.label}
                        {f.type === "textarea" ? (
                          <textarea rows={3} value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                        ) : (
                          <input type={f.type} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })} disabled={f.key === "id" && editing !== "new"} />
                        )}
                      </label>
                    );
                  })}
                </div>
                <footer>
                  <button className="redeem-btn" onClick={() => setEditing(null)}>取消</button>
                  <button className="redeem-btn primary" onClick={saveEdit}>保存</button>
                </footer>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>

      {toast && <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "var(--dash-text)", color: "var(--dash-bg)", padding: "10px 24px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 9999 }}>{toast}</div>}
    </>
  );
}

export const dynamic = "force-dynamic";
