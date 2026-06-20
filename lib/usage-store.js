import { getDashboard, rechargeCustomer, recordCallByToken } from "./customer-store";

export async function addUsage(record) {
  const token = process.env.PROXY_ACCESS_TOKEN || "";
  if (!token) {
    throw new Error("PROXY_ACCESS_TOKEN 未配置，无法记录用量");
  }
  await recordCallByToken(token, record);
}

export async function getUsage() {
  const customer = await getDashboard("cus_demo");
  return customer;
}

export async function recharge(amount) {
  const customer = await rechargeCustomer("cus_demo", amount);
  return customer.balance;
}
