# Token Router China

中国版 OpenRouter MVP：客户账户、独立 API Key、统一 Base URL、模型自动切换、Token 余额、自动充值、调用记录、成本可视化、模型价格排行榜。

## 本地启动

```bash
npm install
npm run dev
```

控制台地址：

```bash
http://localhost:3000
```

## 环境变量

```bash
cp .env.example .env.local
```

需要填写：

```bash
OPENROUTER_API_KEY=your_openrouter_key
PROXY_ACCESS_TOKEN=customer_token_001
PROXY_HTTP_REFERER=http://localhost:3000
PROXY_TITLE=Token Router China
PROXY_USD_CNY_RATE=7.2
```

如果要启用微信/支付宝自动到账充值，还需要配置商户参数：

```bash
# 微信支付 Native
WECHAT_PAY_MCHID=
WECHAT_PAY_APPID=
WECHAT_PAY_SERIAL_NO=
WECHAT_PAY_PRIVATE_KEY=
WECHAT_PAY_PLATFORM_PUBLIC_KEY=
WECHAT_PAY_API_V3_KEY=
WECHAT_PAY_NOTIFY_URL=

# 支付宝当面付
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=
ALIPAY_NOTIFY_URL=
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do
```

默认回调地址：

```bash
POST /api/payments/wechat/notify
POST /api/payments/alipay/notify
```

## OpenAI 兼容接入

客户侧只需要替换 `base_url` 和 `api_key`。

```python
from openai import OpenAI

client = OpenAI(
  api_key="客户在控制台创建的 API Key",
  base_url="http://localhost:3000/api/v1"
)

response = client.chat.completions.create(
  model="auto",
  messages=[{"role": "user", "content": "写一封外贸开发信"}]
)

print(response.choices[0].message.content)
```

## API

- `POST /api/v1/chat/completions`：OpenAI 兼容聊天接口，支持 `model: "auto"` 自动路由
- `POST /api/customer`：客户登录或创建账户
- `POST /api/keys`：给客户创建独立 API Key
- `GET /api/models`：模型价格排行榜
- `GET /api/usage?customerId=xxx`：客户 Token 余额和调用记录
- `POST /api/usage`：人工充值
- `POST /api/proxy?target=chat/completions`：底层 OpenRouter 透传代理

## 当前商业化功能

- 客户登录和账户创建
- 客户独立 API Key 创建
- Token 余额展示和余额扣费
- 人工充值演示
- 客户 API 调用记录
- 累计花费和成本跳动仪表盘
- 模型自动切换
- AI 模型价格排行榜
- 中国版 OpenRouter 控制台

## 上线前下一步

- 接入数据库，替换内存用量记录
- 接入微信、支付宝、银行卡或人工收款审核流
- 给每个客户增加套餐、费率和余额预警
- 按客户做限速、黑名单和异常调用风控
- 增加 Cursor、Dify、Cherry Studio、Coze 的一键接入教程
