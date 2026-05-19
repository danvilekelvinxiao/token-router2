# FlowAPI 数据库上线配置

项目现在支持 Postgres 持久化。生产环境只要配置数据库连接，账户、余额、API Key、调用记录会自动写入数据库。

## 必填环境变量

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
VERIFY_SECRET=替换成一串长期固定的随机密钥
RESEND_API_KEY=你的 Resend API Key
EMAIL_FROM=FlowAPI <你的已验证发信邮箱>
```

## 可选环境变量

```bash
FLOWAPI_INVITE_REQUIRED=true
FLOWAPI_INVITE_CODES=FLOWAPI,VIP001,VIP002
DATABASE_SSL=false
```

## 行为说明

- 没有 `DATABASE_URL` 时，项目会继续使用本地内存数据，方便开发调试。
- 配置 `DATABASE_URL` 后，系统首次访问 API 时会自动创建表：
  - `customers`
  - `api_keys`
  - `calls`
- 数据库会自动写入 demo 账号和默认 API Key：
  - demo 邮箱：`demo@flowapi.fun`
  - demo 密码：`demo123`
  - demo API Key：来自 `PROXY_ACCESS_TOKEN`，未配置则为 `customer_token_001`

## 推荐数据库

优先用 Supabase Postgres、Neon Postgres 或 Vercel Postgres。上线前确认数据库连接串带 `sslmode=require`。
