import { getDashboard, rechargeCustomer, recordCallByToken } from "./customer-store";

export function addUsage(record) {
  if (process.env.PROXY_ACCESS_TOKEN) {
    recordCallByToken(process.env.PROXY_ACCESS_TOKEN, record);
  }
}

export function getUsage() {
  const customer = getDashboard();
  return customer;
}

export function recharge(amount) {
  const customer = rechargeCustomer("", amount);
  return customer?.balance ?? null;
}
