#!/usr/bin/env node

const {
  DEFAULT_RECHARGE_RATE,
  calculateRechargeCreditApi,
  decimalAdd,
  decimalCompare,
  decimalSubtract,
  toApiMoneyString,
  toRmbMoneyString,
} = await import("../lib/wallet/money.js");

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(DEFAULT_RECHARGE_RATE === "5", "default recharge rate should be 5");
assert(calculateRechargeCreditApi("10", DEFAULT_RECHARGE_RATE) === "50.000000", "¥10 should credit $ API 50.000000");
assert(calculateRechargeCreditApi("0.01", DEFAULT_RECHARGE_RATE) === "0.050000", "¥0.01 should credit $ API 0.050000");
assert(toRmbMoneyString("10.129") === "10.13", "RMB should round to two decimals");
assert(toApiMoneyString("0.0324567") === "0.032457", "$ API should round to six decimals");
assert(decimalAdd("0.1", "0.2") === "0.3", "decimal add should avoid float drift");
assert(decimalSubtract("1", "0.333333") === "0.666667", "decimal subtract should keep six decimals");
assert(decimalCompare("50.000000", "49.999999") > 0, "decimal compare should order scaled values");

if (failures.length) {
  console.error("Wallet money config tests failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Wallet money config tests passed");
