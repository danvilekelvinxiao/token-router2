# GMWallet 收银台配置

FlowAPI 的加密货币充值优先走 GMWallet 自动收银台。网关没有配置或临时失败时，页面会切到人工确认兜底，但仍然保留同一笔 FlowAPI 交易流水，方便后台对账。

## 服务器环境变量

在服务器运行目录的环境变量中配置：

```bash
EPUSDT_BASE_URL=https://你的-gmwallet-网关域名
GMWALLET_PID=你的商户 PID
GMWALLET_SECRET_KEY=你的商户密钥
EPUSDT_NOTIFY_URL=https://flowapi.fun/api/payments/crypto/notify
EPUSDT_RETURN_URL=https://flowapi.fun/recharge
```

兼容旧变量名：

```bash
EPUSDT_PID=你的商户 PID
EPUSDT_SECRET_KEY=你的商户密钥
```

## 当前前台支持

- USDT / TRON
- USDC / Polygon

用户下单后会看到：

- 应付币数
- 约合 USD 和人民币订单金额
- FlowAPI 交易流水号
- GMWallet 收银台链接或链上收款地址
- 二维码
- 地址复制
- 每 3 秒到账轮询
- 支付成功后余额自动更新

## 安全口径

- 创建订单成功后，GMWallet `tradeId` 会绑定到 FlowAPI 充值订单。
- 状态查询只使用订单中已绑定的 `tradeId`，不信任前端传入的任意交易号。
- GMWallet 返回的商户订单号必须匹配 FlowAPI 的 `outTradeNo`，否则拒绝入账。
- 链上币数只作为对账凭证，用户余额按 FlowAPI 原订单的人民币金额入账。
- 重复回调不会重复加余额。

## 上线联调清单

1. 配置上面的环境变量。
2. 重启 FlowAPI 服务。
3. 用小额 USDT-TRON 创建订单。
4. 确认页面展示订单号、倒计时、币数、二维码和地址。
5. 支付后确认 `/api/payments/crypto/status` 能查到 paid。
6. 确认 GMWallet 回调 `/api/payments/crypto/notify` 返回 `success`。
7. 确认用户余额按人民币订单金额到账。
8. 重复发送同一回调，确认余额不重复增加。
9. 故意用错误签名回调，确认返回 401。
10. 关闭网关配置，确认页面进入人工确认兜底。
