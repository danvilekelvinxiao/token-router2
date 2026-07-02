export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import { formatApiMoney, formatApiMoneyPrecise, formatRechargeRate, formatRmb } from "@/lib/wallet/money";

export default function WalletPage() {
  const [customer] = useState(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem("flowapi_customer");
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });
  const [wallet, setWallet] = useState(null);
  const [orders, setOrders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [amountRmb, setAmountRmb] = useState("10");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/wallet")
      .then((res) => res.json())
      .then((data) => {
        setWallet(data.wallet || null);
        setOrders(data.orders || []);
        setTransactions(data.transactions || []);
      })
      .catch(() => {});
  }, []);

  const rate = Number(wallet?.exchangeRate || 5);
  const estimatedApi = useMemo(() => Number((Number(amountRmb || 0) * rate).toFixed(2)), [amountRmb, rate]);

  async function submitRecharge(event) {
    event.preventDefault();
    setMessage("");
    const res = await fetch("/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountRmb: Number(amountRmb) }),
    });
    const data = await res.json();
    if (!res.ok) setMessage(data.error || "提交失败");
    else {
      setMessage("充值申请已提交");
      setOrders((prev) => [data.order, ...prev]);
    }
  }

  if (!customer) {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>加载中...</main>;
  }

  return (
    <>
      <Head><title>钱包 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer} currentPath="/wallet">
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 0" }}>
          <h1 style={{ fontSize: 28, marginBottom: 12 }}>钱包中心</h1>
          <p style={{ color: "var(--page-sub)", marginBottom: 24 }}>当前比例：{wallet?.exchangeRateDisplay || formatRechargeRate(rate)}</p>

          <div className="wallet-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
            <section className="card"><h3>钱包余额</h3><strong>{formatApiMoney(wallet?.apiBalance)}</strong><p>当前可用于 API 调用</p></section>
            <section className="card">
              <h3>充值</h3>
              <form onSubmit={submitRecharge}>
                <input value={amountRmb} onChange={(e) => setAmountRmb(e.target.value)} placeholder="充值金额" />
                <p>预计到账：{formatApiMoneyPrecise(estimatedApi, 2)}</p>
                <button type="submit">提交充值申请</button>
              </form>
            </section>
            <section className="card"><h3>账户统计</h3><p>累计充值：{formatRmb(wallet?.totalRechargedRmb)}</p><p>累计到账：{formatApiMoney(wallet?.totalGrantedApi)}</p><p>累计消费：{formatApiMoneyPrecise(wallet?.totalConsumedApi, 6)}</p></section>
            <section className="card"><h3>消息</h3><p>{message || "暂无消息"}</p></section>
          </div>

          <section className="card" style={{ marginTop: 16 }}>
            <h3>充值订单</h3>
            <table><thead><tr><th>订单号</th><th>充值金额</th><th>到账金额</th><th>状态</th><th>创建时间</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td>{order.orderNo}</td><td>{formatRmb(order.amountRmb)}</td><td>{formatApiMoney(order.amountApi)}</td><td>{order.status}</td><td>{order.createdAt}</td></tr>)}</tbody></table>
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <h3>钱包流水</h3>
            <table><thead><tr><th>时间</th><th>类型</th><th>变动金额</th><th>变动后余额</th><th>关联模型</th><th>备注</th></tr></thead><tbody>{transactions.map((tx) => <tr key={tx.id}><td>{tx.createdAt}</td><td>{tx.type}</td><td>{tx.amountApiDisplay}</td><td>{tx.balanceAfterApiDisplay}</td><td>{tx.modelName || "—"}</td><td>{tx.description}</td></tr>)}</tbody></table>
          </section>
        </div>
      </ConsoleLayout>
    </>
  );
}
