import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import ModelLogo from "@/components/ModelLogo";

export default function FreeModelsPage() {
  const [customer, setCustomer] = useState(null);
  const [models, setModels] = useState([]);
  const [membership, setMembership] = useState(null);
  const isMember = membership?.status === "active" && membership?.level === "black_gold";

  useEffect(() => {
    try {
      const stored = localStorage.getItem("flowapi_customer");
      if (stored) queueMicrotask(() => setCustomer(JSON.parse(stored)));
    } catch {}
    let cancelled = false;
    Promise.all([
      fetch("/api/content/models").then((res) => res.json()).catch(() => null),
      fetch("/api/user/wallet-summary").then((res) => res.ok ? res.json() : null).catch(() => null),
    ]).then(([modelData, walletData]) => {
      if (cancelled) return;
      setModels(Array.isArray(modelData?.models) ? modelData.models : []);
      setMembership(walletData?.membership || null);
    });
    return () => { cancelled = true; };
  }, []);

  const freeModels = useMemo(() => models.filter((model) => model.isFreeModel || model.isFreeForMember), [models]);

  return (
    <>
      <Head><title>免费模型广场 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }} currentPath="/models">
        <main className="free-models-page">
          <section className="free-models-hero">
            <div>
              <span>BLACK GOLD MARKET</span>
              <h1>免费模型广场</h1>
              <p>黑金会员可进入免费模型广场，按管理员配置使用会员免费模型和每日限额。</p>
            </div>
            {isMember ? <em>黑金会员已解锁</em> : <Link href="/recharge">开通 FLOWAPI 黑金会员</Link>}
          </section>

          {!isMember ? (
            <section className="free-models-locked">
              <strong>当前账号还不是 FLOWAPI 黑金会员</strong>
              <p>你可以先浏览免费模型介绍。复制 Model ID、创建会员免费调用权限，需要开通黑金会员后使用。</p>
              <Link href="/recharge">开通黑金会员</Link>
            </section>
          ) : null}

          <section className="free-models-grid">
            {freeModels.length ? freeModels.map((model) => (
              <article key={model.id || model.modelId}>
                <ModelLogo model={model.displayName} provider={model.provider} size={42} />
                <div>
                  <h2>{model.displayName}</h2>
                  <p>by {model.provider}</p>
                </div>
                <span>黑金会员可用</span>
                <p>{model.description || "模型介绍同步中。"}</p>
                <small>每日限额：{Number(model.memberDailyFreeLimitTokens || 0) > 0 ? `${Number(model.memberDailyFreeLimitTokens).toLocaleString()} Token` : "按后台配置"}</small>
                {isMember ? <Link href={`/api-management?model=${encodeURIComponent(model.modelId || "")}`}>立即接入</Link> : <button type="button" disabled>会员可接入</button>}
              </article>
            )) : (
              <div className="free-models-empty">
                <strong>免费模型配置中</strong>
                <p>管理员在大模型配置中开启“免费模型”后，这里会展示黑金会员可用模型。</p>
              </div>
            )}
          </section>
        </main>
      </ConsoleLayout>
    </>
  );
}
