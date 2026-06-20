# GMWallet 收银台配置

FlowAPI 的加密货币充值优先走 GMWallet 自动收银台。创建订单后会直接返回 `payment_url`，前端直接跳转到 GMWallet 收银台。

## 服务器环境变量

在服务器运行目录的环境变量中配置：

```bash
GMWALLET_ENABLED=true
GMWALLET_MODE=gmpay
GMWALLET_BASE_URL=https://你的-gmwallet-网关域名
GMWALLET_PID=你的商户 PID
GMWALLET_SECRET_KEY=你的商户密钥
GMWALLET_CURRENCY=cny
GMWALLET_TOKEN=usdt
GMWALLET_NETWORK=tron
GMWALLET_NOTIFY_URL=https://flowapi.fun/api/payments/gmwallet/notify
GMWALLET_RETURN_URL=https://flowapi.fun/recharge
GMWALLET_DIRECT_CHECKOUT=true
```

兼容旧变量名：

```bash
EPUSDT_BASE_URL=你的旧网关地址
EPUSDT_PID=你的商户 PID
EPUSDT_SECRET_KEY=你的商户密钥
EPUSDT_NOTIFY_URL=https://flowapi.fun/api/payments/gmwallet/notify
EPUSDT_RETURN_URL=https://flowapi.fun/recharge
```

## 当前前台支持

- USDT / TRON
- USDC / Polygon

用户下单后会直接跳转到 GMWallet 收银台，订单页面保留：

- FlowAPI 交易流水号
- 订单状态
- 回到 FlowAPI 后的到账查询

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
5. 支付后确认 `/api/payments/gmwallet/status` 能查到 paid。
6. 确认 GMWallet 回调 `/api/payments/gmwallet/notify` 返回 `ok`。
7. 确认用户余额按人民币订单金额到账。
8. 重复发送同一回调，确认余额不重复增加。
9. 故意用错误签名回调，确认返回 401。
10. 关闭网关配置，确认页面返回精确缺失字段提示。
