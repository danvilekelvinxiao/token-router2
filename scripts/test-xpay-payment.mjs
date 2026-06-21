import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./esm-alias-loader.mjs", import.meta.url), pathToFileURL(`${process.cwd().replace(/\/+$/, "")}/`));

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnv(path.join(process.cwd(), ".env.local"));

const prev = {
  XPAY_ENABLED: process.env.XPAY_ENABLED,
  XPAY_PROVIDER_NAME: process.env.XPAY_PROVIDER_NAME,
  XPAY_QR_IMAGE: process.env.XPAY_QR_IMAGE,
  XPAY_QR_CONTENT: process.env.XPAY_QR_CONTENT,
  XPAY_PAYMENT_NOTE_PREFIX: process.env.XPAY_PAYMENT_NOTE_PREFIX,
  XPAY_MANUAL_CONFIRM: process.env.XPAY_MANUAL_CONFIRM,
  XPAY_QUERY_URL: process.env.XPAY_QUERY_URL,
  XPAY_QUERY_METHOD: process.env.XPAY_QUERY_METHOD,
  XPAY_QUERY_ORDER_PARAM: process.env.XPAY_QUERY_ORDER_PARAM,
  XPAY_QUERY_STATUS_FIELD: process.env.XPAY_QUERY_STATUS_FIELD,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(prev)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

try {
  process.env.XPAY_ENABLED = "true";
  process.env.XPAY_PROVIDER_NAME = "XPay";
  process.env.XPAY_QR_CONTENT = "https://pay.example.com/qr/abc";
  process.env.XPAY_PAYMENT_NOTE_PREFIX = "XPAY";
  process.env.XPAY_MANUAL_CONFIRM = "true";

  const mod = await import(new URL("../lib/payments/xpay.js", import.meta.url).href);

  assert.equal(mod.isXPayConfigured(), true, "xpay should be configured");
  const safe = mod.getXPayConfigSafe();
  assert.equal(safe.providerName, "XPay");
  assert.equal(safe.qrContent, "[masked]");
  assert.equal(safe.paymentNotePrefix, "XPAY");
  assert.equal(safe.manualConfirm, true);

  const payment = await mod.createXPayRechargePayment({
    order: { outTradeNo: "flow_rch_test_001", amount: 20 },
    amountCny: 20,
  });
  assert.equal(payment.provider, "xpay");
  assert.equal(payment.orderId, "flow_rch_test_001");
  assert.equal(payment.paymentNote, "XPAY-flow_rch_test_001");
  assert.equal(payment.manualConfirm, true);
  assert.ok(payment.qrImage.startsWith("data:image/"), "qr image should be a data url");

  const guide = mod.getXPayMappingGuide();
  assert.equal(guide.sourceProfile.stateRoute, "/pay/state/{orderId}");
  assert.equal(guide.sourceProfile.statusField, "result");
  assert.equal(guide.sourceProfile.paidValue, "1");
  assert.equal(guide.query.statusField, "result");

  const normalized = mod.normalizeXPayQueryResponse({ success: true, result: 1, data: { tradeNo: "T-001" } });
  assert.equal(normalized.paid, true, "result=1 should be treated as paid");
  assert.equal(normalized.tradeNo, "T-001");

  delete process.env.XPAY_NOTIFY_SECRET;
  assert.deepEqual(
    mod.verifyXPayNotifySignature({ orderId: "flow_rch_001", amount: 20, status: "paid" }, {}),
    { ok: false, reason: "missing-secret" },
    "unsigned notify payload must be rejected when secret is missing",
  );

  process.env.XPAY_NOTIFY_SECRET = "xpay-test-secret";
  const signedPayload = { orderId: "flow_rch_001", amount: 20, status: "paid" };
  const signedBody = JSON.stringify({
    orderId: signedPayload.orderId,
    tradeNo: "",
    amount: signedPayload.amount,
    paidAt: "",
    status: "success",
  });
  const signature = crypto.createHmac("sha256", process.env.XPAY_NOTIFY_SECRET).update(signedBody).digest("hex");
  assert.deepEqual(
    mod.verifyXPayNotifySignature({ ...signedPayload }, { "x-xpay-signature": signature }),
    { ok: false, reason: "signature-mismatch" },
    "mismatched canonical signature body should still be rejected",
  );

  process.env.XPAY_ENABLED = "false";
  assert.equal(mod.isXPayConfigured(), false, "disabled xpay should not be configured");

  const { approveRechargeOrder, createRechargeOrder, markRechargeOrderPaid } = await import(new URL("../lib/customer-store.js", import.meta.url).href);
  const { query } = await import(new URL("../lib/db.js", import.meta.url).href);
  const { getUserWallet } = await import(new URL("../lib/wallet/ledger.js", import.meta.url).href);

  const customerId = "cus_admin";
  const walletBefore = await getUserWallet(customerId);
  const walletBeforeBalance = Number(walletBefore.usdTokenBalance);
  const orderResult = await createRechargeOrder({
    customerId,
    amount: 20,
    paymentMethod: "xpay",
    purchaseType: "balance_recharge",
    paymentRef: "XPAY-flow_rch_test",
  });
  assert.ok(orderResult.order?.outTradeNo, "recharge order should include outTradeNo");

  const paidOnce = await markRechargeOrderPaid({
    outTradeNo: orderResult.order.outTradeNo,
    providerTradeNo: "XPAY-T-001",
    amount: 20,
    approvedBy: "xpay_notify",
    rawPayload: JSON.stringify({ source: "test" }),
  });
  assert.ok(!paidOnce.error, paidOnce.error || "first settlement should succeed");

  const walletAfter = await getUserWallet(customerId);
  const walletAfterBalance = Number(walletAfter.usdTokenBalance);
  assert.equal(walletAfterBalance - walletBeforeBalance, 100, "recharge should credit spendable token wallet");

  const paidTwice = await markRechargeOrderPaid({
    outTradeNo: orderResult.order.outTradeNo,
    providerTradeNo: "XPAY-T-001",
    amount: 20,
    approvedBy: "xpay_notify",
    rawPayload: JSON.stringify({ source: "test" }),
  });
  assert.ok(!paidTwice.error, paidTwice.error || "duplicate settlement should be idempotent");
  const walletAfterSecond = await getUserWallet(customerId);
  assert.equal(Number(walletAfterSecond.usdTokenBalance), walletAfterBalance, "duplicate settlement must not double credit");

  const recoveryOrder = await createRechargeOrder({
    customerId,
    amount: 20,
    paymentMethod: "xpay",
    purchaseType: "balance_recharge",
    paymentRef: "XPAY-flow_rch_test_recovery",
  });
  const storedRecoveryOrderResult = await query("SELECT * FROM recharge_orders WHERE out_trade_no = $1 LIMIT 1", [recoveryOrder.order.outTradeNo]);
  const storedRecoveryOrder = storedRecoveryOrderResult.rows[0];
  assert.ok(storedRecoveryOrder, "recovery test should find stored order");
  await query(
    `UPDATE recharge_orders
     SET status = 'approved',
         paid_at = NOW(),
         approved_at = NOW(),
         approved_by = 'xpay_notify'
     WHERE out_trade_no = $1`,
    [recoveryOrder.order.outTradeNo]
  );

  const recoveryBefore = Number((await getUserWallet(customerId)).usdTokenBalance);
  const recovered = await markRechargeOrderPaid({
    outTradeNo: recoveryOrder.order.outTradeNo,
    providerTradeNo: "XPAY-T-RECOVER",
    amount: 20,
    approvedBy: "xpay_notify",
    rawPayload: JSON.stringify({ source: "test-recovery" }),
  });
  assert.ok(!recovered.error, recovered.error || "approved-but-unsettled order should recover");

  const recoveryAfter = Number((await getUserWallet(customerId)).usdTokenBalance);
  assert.equal(recoveryAfter - recoveryBefore, 100, "approved-but-unsettled order should still credit exactly once");

  const recoveredAgain = await markRechargeOrderPaid({
    outTradeNo: recoveryOrder.order.outTradeNo,
    providerTradeNo: "XPAY-T-RECOVER",
    amount: 20,
    approvedBy: "xpay_notify",
    rawPayload: JSON.stringify({ source: "test-recovery" }),
  });
  assert.ok(!recoveredAgain.error, recoveredAgain.error || "recovered settlement should remain idempotent");
  const recoveryFinal = Number((await getUserWallet(customerId)).usdTokenBalance);
  assert.equal(recoveryFinal, recoveryAfter, "recovered order must not double credit");

  const manualOrder = await createRechargeOrder({
    customerId,
    amount: 20,
    paymentMethod: "xpay",
    purchaseType: "balance_recharge",
    paymentRef: "XPAY-flow_rch_manual_approve",
  });
  const manualBefore = Number((await getUserWallet(customerId)).usdTokenBalance);
  const manualApproved = await approveRechargeOrder({ orderId: manualOrder.order.id, approvedBy: "admin" });
  assert.ok(!manualApproved.error, manualApproved.error || "manual approve should settle");
  const manualAfter = Number((await getUserWallet(customerId)).usdTokenBalance);
  assert.equal(manualAfter - manualBefore, 100, "manual approval should credit spendable token wallet");

  const gatewayServer = http.createServer((req, res) => {
    const url = new URL(req.url || "", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname.startsWith("/pay/state/")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        result: 1,
        data: {
          outTradeNo: url.pathname.split("/").pop(),
          tradeNo: "QUERY-T-001",
          amount: 20,
          paidAt: new Date().toISOString(),
        },
      }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  try {
    const gatewayPort = await new Promise((resolve) => {
      gatewayServer.listen(0, "127.0.0.1", () => resolve(gatewayServer.address().port));
    });
    process.env.XPAY_QUERY_URL = `http://127.0.0.1:${gatewayPort}/pay/state/{orderId}`;
    process.env.XPAY_QUERY_METHOD = "GET";
    process.env.XPAY_QUERY_ORDER_PARAM = "orderId";
    process.env.XPAY_QUERY_STATUS_FIELD = "result";

    const statusOrder = await createRechargeOrder({
      customerId,
      amount: 20,
      paymentMethod: "xpay",
      purchaseType: "balance_recharge",
      paymentRef: "XPAY-flow_rch_status_poll",
    });
    const { createSessionToken } = await import(new URL("../lib/session.js", import.meta.url).href);
    const sessionToken = createSessionToken({ id: customerId, email: "xiaoyijie@flowapi.fun" });
    const statusHandler = (await import(new URL("../pages/api/payments/xpay/status.js", import.meta.url).href)).default;

    const response = await new Promise((resolve) => {
      const res = {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) {
          this.headers[String(name).toLowerCase()] = value;
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          resolve(this);
          return this;
        },
      };
      const req = {
        method: "GET",
        query: { orderId: statusOrder.order.id },
        headers: { cookie: `flowapi_session=${encodeURIComponent(sessionToken)}` },
      };
      Promise.resolve(statusHandler(req, res)).catch((error) => {
        res.status(500).json({ error: error.message || String(error) });
      });
    });

    assert.equal(response.statusCode, 200, "status poll should succeed");
    assert.equal(response.body?.paid, true, "status poll should mark the order paid");
    assert.equal(response.body?.order?.status, "approved", "status poll should approve the recharge order");
    const statusAfter = Number((await getUserWallet(customerId)).usdTokenBalance);
    assert.equal(statusAfter - manualAfter, 100, "status poll should credit spendable token wallet exactly once");
  } finally {
    gatewayServer.close();
  }

  console.log("xpay-payment-check: ok");
} finally {
  restoreEnv();
}
