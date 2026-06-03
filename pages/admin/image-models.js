import Head from "next/head";
import { useEffect, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";

export default function AdminImageModelsPage() {
  const [customer] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("flowapi_customer");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [models, setModels] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      const response = await fetch("/api/admin/image-models");
      const json = await response.json();
      if (!cancelled) setModels(Array.isArray(json.models) ? json.models : []);
    }
    loadModels();
    return () => { cancelled = true; };
  }, []);

  async function toggleModel(model) {
    const response = await fetch("/api/admin/image-models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId: model.id,
        updates: { enabled: !model.enabled },
      }),
    });
    const json = await response.json();
    if (json.model) {
      setModels((current) => current.map((item) => item.id === json.model.id ? json.model : item));
    }
  }

  return (
    <>
      <Head><title>图片模型管理 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer || { name: "管理员", email: "", id: "", balance: 0, apiKeys: [] }} currentPath="/admin">
        <main className="team-billing-page">
          <section className="image-history-head">
            <div>
              <span>Admin</span>
              <h1>图片模型管理</h1>
              <p>后台可以启用 / 停用图片模型，控制前台默认推荐和价格映射。</p>
            </div>
          </section>
          <div className="image-logs-table-wrap">
            <table className="image-logs-table">
              <thead>
                <tr>
                  <th>显示名称</th>
                  <th>上游模型</th>
                  <th>标签</th>
                  <th>文生图</th>
                  <th>图生图</th>
                  <th>单张价格</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {models.map((item) => (
                  <tr key={item.id}>
                    <td>{item.displayName}</td>
                    <td>{item.upstreamModel}</td>
                    <td>{(item.labelTags || []).join(" / ")}</td>
                    <td>{item.supportsTextToImage ? "支持" : "否"}</td>
                    <td>{item.supportsImageToImage ? "支持" : "否"}</td>
                    <td>￥{Number(item.unitPriceRmbTextToImage || 0).toFixed(2)}</td>
                    <td>{item.enabled ? "启用" : "停用"}</td>
                    <td><button type="button" onClick={() => toggleModel(item)}>{item.enabled ? "停用" : "启用"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </ConsoleLayout>
    </>
  );
}
