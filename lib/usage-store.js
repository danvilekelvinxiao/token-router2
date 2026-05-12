import { getDashboard, rechargeCustomer, recordCallByToken } from "./customer-store";

export function addUsage(record) {
  recordCallByToken(process.env.PROXY_ACCESS_TOKEN || "customer_token_001", record);
}

export function getUsage() {
  const customer = getDashboard("cus_demo");
  return customer;
}

export function recharge(amount) {
  const customer = rechargeCustomer("cus_demo", amount);
  return customer.balance;
}
