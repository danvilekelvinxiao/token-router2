# FlowAPI Figma Page Breakdown

This is the build sheet for Figma. Use it as a page-by-page construction checklist that can be translated directly into frames, components, and variants.

## How to use this file
- Build tokens first.
- Build shared components second.
- Build each page as a separate Figma frame set.
- Keep the live app route order unchanged.
- Reuse the same card, chart, table, tooltip, and button components across pages.
- If a page has no real data, show empty geometry or `—`, never fake values.

## Page 1. Login / Entry
### Frames to build
- Login / Desktop / 1440
- Login / Tablet / 768
- Login / Mobile / 390

### Section order
1. Brand block
2. Login form
3. Helper entry
4. Footer trust note

### Components to place
- Auth / Brand Mark
- Auth / Input Field
- Auth / Primary Button
- Auth / Secondary Link

### Build notes
- Minimal only.
- No marketing copy.
- FlowAPI gradient only in logo or wordmark.

## Page 2. Dashboard
### Frames to build
- Dashboard / Desktop / 1440
- Dashboard / Tablet / 768
- Dashboard / Mobile / 390

### Section order
1. Header / greeting
2. AI Token 资产总览
3. 模型使用可视化看板
4. 钱包与套餐进度
5. 模型排行榜
6. 活动热力 / 日志
7. Token 市场 / 成本面板

### Block: Model Usage Dashboard
#### Part A. Metric cards
- 总请求量
- 成功会话
- Token 消耗
- 费用支出

#### Part B. Charts
- 请求分布 donut
- Token 资源消耗横向堆叠图

#### Part C. Trend
- 周期性增长趋势折线图

#### Part D. Table
- 模型明细看板

### Components to place
- Dashboard / Section Header
- Dashboard / Metric Card
- Dashboard / Donut Chart Card
- Dashboard / Token Bar Chart Card
- Dashboard / Growth Trend Card
- Dashboard / Model Detail Table

### Layout rules
- Metric cards come before charts.
- Charts use a two-column split on desktop.
- Trend spans full width.
- Table spans full width.
- Never let labels overflow.

### Empty-state rules
- Empty metric cards show `—`, not `0`.
- Empty donut shows an empty ring with center label only.
- Empty token bars show empty geometry only.
- Empty trend shows a baseline or zero line only.
- Empty table keeps the header and shows no rows.
- Avoid any body copy that suggests fake activity or implies data exists when it does not.

## Page 3. Model Marketplace
### Frames to build
- Marketplace / Desktop / 1440
- Marketplace / Tablet / 768
- Marketplace / Mobile / 390

### Section order
1. Category chips
2. Search / filter row
3. Model grid
4. Provider logo row
5. Model detail drawer

### Components
- Marketplace/Filter Chip
- Marketplace/Model Card
- Marketplace/Provider Logo
- Marketplace/Price Row
- Marketplace/Drawer

### Notes
- Show provider logos.
- Keep source naming clean.
- Make access state and price easy to scan.

## Page 4. Recharge
### Frames to build
- Recharge / Desktop / 1440
- Recharge / Tablet / 768
- Recharge / Mobile / 390

### Section order
1. Wallet summary
2. Recharge amount selector
3. Payment method selector
4. QR / payment modal area
5. Payment result / success state
6. Add-on services
7. Orders / history

### Components
- Recharge/Amount Card
- Recharge/Method Pill
- Recharge/QR Card
- Recharge/Status Banner
- Recharge/Order Row

### Notes
- Payment actions must be visually obvious.
- Show wallet and plan state first.
- Empty QR states must still look intentional.

## Page 5. Profile
### Frames to build
- Profile / Desktop / 1440
- Profile / Tablet / 768
- Profile / Mobile / 390

### Section order
1. Profile identity card
2. 我的模型使用画像
3. Asset ranking / titles
4. Referral / membership blocks
5. Announcement / activity blocks

### Components
- Profile/Identity Card
- Profile/Personal Model Profile
- Profile/Ranking Card
- Profile/Badge Card
- Profile/Referral Card

### Notes
- Personal data only in this section.
- Keep it consistent with Dashboard but smaller in scope.
- Empty personal usage blocks use `—` or empty geometry only.

## Page 6. API Management
### Frames to build
- API Management / Desktop / 1440
- API Management / Tablet / 768
- API Management / Mobile / 390

### Section order
1. Key list
2. Create key flow
3. Access control / model access
4. Usage rules / limits
5. Secret handling notes

### Components
- API/Key Card
- API/Create Key Modal
- API/Access Toggle
- API/Limit Row

### Notes
- Make the primary action unmistakable.
- Disabled states need a reason.
- Empty permissions or no-access states must show the reason, not a fake usable value.

## Page 7. Team Space
### Frames to build
- Team Space / Desktop / 1440
- Team Space / Tablet / 768
- Team Space / Mobile / 390

### Section order
1. Team summary
2. Members list
3. Team usage
4. Team billing
5. Role / permission state

### Components
- Team/Summary Card
- Team/Member Row
- Team/Usage Chart
- Team/Billing Table

### Notes
- Leader and member views must stay distinct.
- Empty team data must not look like active usage.

## Page 8. Admin Console
### Frames to build
- Admin Console / Desktop / 1440
- Admin Console / Tablet / 768
- Admin Console / Mobile / 390

### Section order
1. Overview metrics
2. Upstream / channel health
3. Model routing
4. Billing / profit
5. Security / rate limits
6. Users / logs

### Components
- Admin/Stat Card
- Admin/Health Table
- Admin/Route Table
- Admin/Profit Card
- Admin/Users Table

### Notes
- Dense but scannable.
- Keep real operational states obvious.
- Empty admin metrics use `—`, not placeholder revenue or fake counts.

## Page 9. Components
### Build first
1. Top nav
2. Sidebar
3. Metric card
4. Chart card
5. Table card
6. Status dot
7. Tooltip
8. Drawer
9. Modal
10. Primary / secondary / ghost / disabled buttons
11. Empty-state shells
12. Loading skeletons

### Notes
- Store theme, size, and state variants.
- Keep radius and shadows consistent.

## Page 10. Tokens
### Store
- Color styles
- Typography styles
- Radius styles
- Shadow styles
- Spacing scale
- Button states
- Status states
- Tooltip styles
- Empty-state tokens
- Loading tokens

### Notes
- Tokens first.
- Components second.
- Pages last.

## Handoff order
1. Tokens
2. Shared components
3. Dashboard
4. Profile
5. Recharge
6. Model Marketplace
7. API Management
8. Team Space
9. Admin Console
10. Empty-state review pass

## Do not change in Figma
- core navigation order
- page purposes
- billing logic
- scope rules for user / team / admin
- model / provider naming contracts
- empty-state behavior contracts
