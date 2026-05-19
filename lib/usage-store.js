import { getDashboard, rechargeCustomer, recordCallByToken } from "./customer-store";

export async function addUsage(record) {
  await recordCallByToken(process.env.PROXY_ACCESS_TOKEN || "sk-default", record);
}

export async function getUsage() {
  const customer = await getDashboard("cus_demo");
  return customer;
}

export async function recharge(amount) {
  const customer = await rechargeCustomer("cus_demo", amount);
  return customer.balance;
}
