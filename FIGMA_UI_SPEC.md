# FlowAPI Figma UI Spec

## Goal
Make the current FlowAPI UI editable in Figma without changing product logic. This spec mirrors the live app structure, tokens, and component hierarchy so design changes can be made in Figma and then applied back to code.

## Page-level build rule
This is a page construction spec, not a moodboard. For every page, build the page shell, then the section order, then the shared components, then the variants.

## Source files
- DESIGN.md
- styles/globals.css
- components/ConsoleLayout.js
- components/dashboard/model-usage-visualization.tsx
- components/wallet/wallet-progress-card.tsx
- pages/dashboard.js
- pages/profile.js
- pages/recharge.js
- pages/models.js
- pages/admin/*

## Brand system
- Primary: FlowAPI blue-purple gradient
- Support: cyan, green, amber, red
- Neutral surfaces: cool white and charcoal cards
- Tone: cold-tech, commercial, operational, premium

## Typography
- Base family: current system sans stack
- Numbers: tabular-nums
- Headings: compact, weight 700 to 900
- Body: 13 to 15px
- Metric numbers: 28 to 40px depending on card density

## Layout frames
- Desktop primary: 1440 x 1600
- Desktop secondary: 1200 x 1600
- Tablet: 768 x 1600
- Mobile: 390 x 1600

## Grids
- Desktop: 12 columns, 24px gutter, 80px side margin
- Tablet: 8 columns, 16px gutter, 32px side margin
- Mobile: 4 columns, 16px gutter, 16px side margin

## Global spacing
- 8px base scale
- Card padding: 16 / 20 / 24 / 32
- Section gap: 24 / 32 / 40
- Internal chip gap: 6 / 8 / 10

## Radii
- Card: 8 to 12
- Large panel: 16 to 22
- Pills and badges: 999

## Shadows
- Light: soft elevation, no heavy blur
- Dark: subtle outer glow only

## Core Figma pages
1. Login / Entry
2. Dashboard
3. Model Marketplace
4. Recharge
5. Profile
6. API Management
7. Team Space
8. Admin Console
9. Components
10. Tokens

## Dashboard page structure
### Desktop order
1. Top nav and sidebar
2. Hero summary and greeting strip
3. AI Token assets overview
4. Model usage visualization
5. Wallet and plan progress
6. Model leaderboard and ranking
7. Activity heatmap and logs
8. Token market and cost panel

### Model usage visualization block
- Section title: Model Usage Dashboard
- Subtitle: FlowAPI model usage and cost overview
- Part A: 4 metric cards
- Part B: request donut and token stacked bars
- Part C: growth trend chart
- Part D: model detail table

### Figma component names
- Dashboard/Metric Card
- Dashboard/Donut Chart Card
- Dashboard/Token Bar Chart Card
- Dashboard/Growth Trend Card
- Dashboard/Model Detail Table

## Profile page structure
### Desktop order
1. Top nav and sidebar
2. Profile identity card
3. Personal model usage visualization
4. Asset ranking and badge section
5. Referral, wallet, and announcement blocks

### Personal model usage block
- Section title: 我的模型使用画像
- Subtitle: Personal Model Profile
- Same component set as dashboard, scope=user

## Recharge page structure
1. Wallet summary
2. Recharge amount picker
3. Payment method picker
4. QR / modal payment area
5. Order status / success state
6. Add-on services

## Model marketplace page structure
1. Category filter chips
2. Search and sort row
3. Model cards grid
4. Model detail drawer
5. Provider logo and price row

## Admin console structure
1. Overview metrics
2. Channel health table
3. Routing and model mapping panels
4. Billing and profit blocks
5. Security and rate limit panels
6. Logs and users

## Component library
### Cards
- metric card
- chart card
- table card
- wallet summary card
- profile identity card
- admin stat card

### Controls
- primary button
- secondary button
- ghost button
- disabled button
- icon button
- segmented control
- filter chip
- tab
- toggle
- range selector

### Data display
- status dot
- status pill
- model row
- token row
- progress bar
- empty state chart shell
- tooltip

### Overlays
- modal
- drawer
- popover

## Theme rules
### Light
- Background: very soft cool gray
- Cards: slightly translucent white
- Borders: low contrast
- Text: near black

### Dark
- Background: charcoal blue
- Cards: glassy dark surfaces
- Borders: subtle cool gray
- Text: near white

## State rules
- Loading: skeleton blocks or faded placeholders
- Empty: empty geometry or `—` only
- Error: short banner, no long paragraphs
- Success: small confirmation badge or toast
- Disabled: dimmed but readable

## Copy rules
- Short labels
- Precise numerals only when real data exists
- No marketing filler
- No duplicate explanation in every card

## Figma build order
1. Create color styles and text styles
2. Build card components
3. Build chart shells
4. Build table rows and status tokens
5. Compose Dashboard
6. Compose Profile
7. Compose Recharge
8. Compose Model Marketplace
9. Compose Admin

## Mapping from app to Figma
- ConsoleLayout -> page shell
- WalletProgressCard -> wallet summary component
- ModelUsageVisualization -> dashboard and profile visualization block
- ModelLogo -> model branding token
- LiveNumber -> animated metric text
- CardDetailModal -> details modal

## Editable areas for you in Figma
- spacing density
- chart proportions
- card radius
- button emphasis
- copy length
- sidebar width
- dashboard card ordering inside a section

## Do not change in Figma
- core navigation order
- page purposes
- billing logic
- scope rules for user, team, admin
- model and provider naming contracts
