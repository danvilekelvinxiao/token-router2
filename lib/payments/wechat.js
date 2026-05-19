import crypto from "node:crypto";
import QRCode from "qrcode";
import {
  getAppOrigin,
  makeRechargeDescription,
  parsePem,
  randomNonce,
  readRawBody,
  signRsaSha256,
  toFen,
  verifyRsaSha256,
} from "@/lib/payments/common";

const endpoint = "https://api.mch.weixin.qq.com";

function getWechatConfig() {
  const mchid = process.env.WECHAT_PAY_MCHID || "";
  const appid = process.env.WECHAT_PAY_APPID || "";
  const serialNo = process.env.WECHAT_PAY_SERIAL_NO || "";
  const privateKey = parsePem(process.env.WECHAT_PAY_PRIVATE_KEY || "");
  const platformPublicKey = parsePem(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY || "");
  const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY || "";
  return { mchid, appid, serialNo, privateKey, platformPublicKey, apiV3Key };
}

export function isWechatConfigured() {
  const config = getWechatConfig();
  return Boolean(
    config.mchid &&
    config.appid &&
    config.serialNo &&
    config.privateKey &&
    config.platformPublicKey &&
    config.apiV3Key
  );
}

function buildWechatAuthorization({ method, path, body, mchid, serialNo, privateKey }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = randomNonce(16);
  const message = `${method}\n${path}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = signRsaSha256(message, privateKey);
  const token = `mchid="${mchid}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;
  return `WECHATPAY2-SHA256-RSA2048 ${token}`;
}

export async function createWechatRechargePayment({ req, order }) {
  const config = getWechatConfig();
  if (!isWechatConfigured()) {
    return { error: "微信商户参数未配置完整" };
  }

  const notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL || `${getAppOrigin(req)}/api/payments/wechat/notify`;
  const path = "/v3/pay/transactions/native";
  const payload = {
    appid: config.appid,
    mchid: config.mchid,
    description: makeRechargeDescription(order.amount),
    out_trade_no: order.outTradeNo,
    notify_url: notifyUrl,
    amount: {
      total: toFen(order.amount),
      currency: "CNY",
    },
    attach: JSON.stringify({
      orderId: order.id,
      customerId: order.customerId,
    }),
  };
  const body = JSON.stringify(payload);
  const res = await fetch(`${endpoint}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: buildWechatAuthorization({
        method: "POST",
        path,
        body,
        mchid: config.mchid,
        serialNo: config.serialNo,
        privateKey: config.privateKey,
      }),
      "User-Agent": "FlowAPI/1.0",
    },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data.message || data.code || "微信下单失败" };
  }

  return {
    provider: "wechat",
    qrContent: data.code_url,
    qrImage: await QRCode.toDataURL(data.code_url, { width: 320, margin: 1 }),
    raw: data,
  };
}

export async function parseWechatNotify(req) {
  const config = getWechatConfig();
  if (!isWechatConfigured()) {
    return { error: "微信商户参数未配置完整" };
  }

  const rawBody = await readRawBody(req);
  const bodyText = rawBody.toString("utf8");
  const headers = req.headers;
  const timestamp = String(headers["wechatpay-timestamp"] || "");
  const nonce = String(headers["wechatpay-nonce"] || "");
  const signature = String(headers["wechatpay-signature"] || "");
  const serial = String(headers["wechatpay-serial"] || "");

  if (!timestamp || !nonce || !signature || !serial) {
    return { error: "微信回调头缺失" };
  }

  const message = `${timestamp}\n${nonce}\n${bodyText}\n`;
  const verified = verifyRsaSha256(message, signature, config.platformPublicKey);
  if (!verified) {
    return { error: "微信回调验签失败" };
  }

  const encrypted = JSON.parse(bodyText || "{}");
  const resource = encrypted.resource || {};
  const key = Buffer.from(config.apiV3Key, "utf8");
  const cipherText = Buffer.from(resource.ciphertext || "", "base64");
  const authTag = cipherText.subarray(cipherText.length - 16);
  const data = cipherText.subarray(0, cipherText.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(resource.nonce || "", "utf8"));
  decipher.setAAD(Buffer.from(resource.associated_data || "", "utf8"));
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  const result = JSON.parse(plain || "{}");

  return {
    result,
    raw: bodyText,
  };
}
