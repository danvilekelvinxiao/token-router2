import { hasDatabase, query } from "@/lib/db";
import { listCustomers, listRechargeOrders } from "@/lib/customer-store";
import { requireAdmin } from "@/lib/admin-auth";

function todayKey(value = new Date()) {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function monthKey(value = new Date()) {
  return todayKey(value).slice(0, 7);
}

function number(value) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

async function dbStats() {
  const [wallet, recharge, calls, pending] = await Promise.all([
    query(`SELECT COALESCE(SUM(balance), 0) AS platform_api_balance FROM customers WHERE deleted_at IS NULL`),
    query(`SELECT
        COALESCE(SUM(COALESCE(payment_amount_rmb, amount)) FILTER (WHERE status = 'approved' AND approved_at >= date_trunc('day', NOW())), 0) AS today_recharge_rmb,
        COALESCE(SUM(COALESCE(credited_amount_api, amount)) FILTER (WHERE status = 'approved' AND approved_at >= date_trunc('day', NOW())), 0) AS today_granted_api,
        COALESCE(SUM(COALESCE(payment_amount_rmb, amount)) FILTER (WHERE status = 'approved'), 0) AS total_recharge_rmb,
        COALESCE(SUM(COALESCE(credited_amount_api, amount)) FILTER (WHERE status = 'approved'), 0) AS total_granted_api
      FROM recharge_orders`),
    query(`SELECT
        COALESCE(SUM(cost) FILTER (WHERE created_at >= date_trunc('day', NOW())), 0) AS today_consumption_api,
        COALESCE(SUM(cost) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0) AS month_consumption_api
      FROM calls`),
    query(`SELECT COUNT(*)::int AS pending_orders FROM recharge_orders WHERE status = 'pending'`),
  ]);
  return {
    platformApiBalance: number(wallet.rows[0]?.platform_api_balance),
    todayRechargeRmb: number(recharge.rows[0]?.today_recharge_rmb),
    todayGrantedApi: number(recharge.rows[0]?.today_granted_api),
    todayConsumptionApi: number(calls.rows[0]?.today_consumption_api),
    monthConsumptionApi: number(calls.rows[0]?.month_consumption_api),
    pendingOrders: number(pending.rows[0]?.pending_orders),
    totalRechargeRmb: number(recharge.rows[0]?.total_recharge_rmb),
    totalGrantedApi: number(recharge.rows[0]?.total_granted_api),
  };
}

async function memoryStats() {
  const [customers, orders] = await Promise.all([
    listCustomers(),
    listRechargeOrders({ limit: 10000 }),
  ]);
  const today = todayKey();
  const month = monthKey();
  const allCalls = customers.flatMap((customer) => customer.calls || []);
  const approved = orders.filter((order) => order.status === "approved");
  return {
    platformApiBalance: customers.reduce((sum, customer) => sum + number(customer.balance), 0),
    todayRechargeRmb: approved.filter((order) => todayKey(order.approvedAt || order.createdAt) === today).reduce((sum, order) => sum + number(order.paymentAmountRmb ?? order.amount), 0),
    todayGrantedApi: approved.filter((order) => todayKey(order.approvedAt || order.createdAt) === today).reduce((sum, order) => sum + number(order.creditedAmountApi ?? order.amountApi ?? order.amount), 0),
    todayConsumptionApi: allCalls.filter((call) => todayKey(call.createdAt) === today).reduce((sum, call) => sum + number(call.cost), 0),
    monthConsumptionApi: allCalls.filter((call) => monthKey(call.createdAt) === month).reduce((sum, call) => sum + number(call.cost), 0),
    pendingOrders: orders.filter((order) => order.status === "pending").length,
    totalRechargeRmb: approved.reduce((sum, order) => sum + number(order.paymentAmountRmb ?? order.amount), 0),
    totalGrantedApi: approved.reduce((sum, order) => sum + number(order.creditedAmountApi ?? order.amountApi ?? order.amount), 0),
  };
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
  }

  try {
    const stats = hasDatabase() ? await dbStats() : await memoryStats();
    return res.status(200).json({
      ok: true,
      stats: {
        ...stats,
        rechargeRate: 5,
        rechargeRateText: "¥1 = $ API 5",
      },
    });
  } catch (error) {
    console.error("[admin] wallet stats failed:", error);
    return res.status(500).json({ ok: false, code: "ADMIN_WALLET_STATS_ERROR", message: "钱包统计加载失败" });
  }
}
