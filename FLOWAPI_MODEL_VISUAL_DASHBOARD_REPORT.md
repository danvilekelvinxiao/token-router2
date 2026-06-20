# FLOWAPI Model Visual Dashboard Report

## What changed
- Added `Model Usage Visualization` as a reusable dashboard module.
- Wired the module into the data dashboard and profile pages.
- Added a dedicated API route for real usage aggregation.
- Added shared aggregation helpers for team, workspace, user, and global scopes.
- Installed and integrated `recharts` as the chart plugin source from GitHub for the new dashboard visuals.

## Placement
- Dashboard: inserted after `AI Token 资产总览`, before `钱包与套餐进度`.
- Profile: inserted after the user profile card, before asset ranking and title sections.

## Files
- `components/dashboard/model-usage-visualization.tsx`
- `lib/model-usage-visualization.js`
- `pages/api/dashboard/model-usage-visualization.js`
- `pages/dashboard.js`
- `pages/profile.js`

## API
- `GET /api/dashboard/model-usage-visualization`

Query:
- `scope=user | workspace | team | global`
- `teamId` optional
- `range=7d | 30d | 90d`

## Data sources
- `usage_logs`
- `image_generation_logs`
- `team_usage_logs`
- Existing customer and team summary loaders in the app

## Visualization set
- Top 4 metric cards
- Request distribution donut
- Token resource bar chart
- 7 / 30 / 90 day growth trend
- Model detail table

## Empty state policy
- Metric cards show `—` when there is no real data.
- Donut shows an empty ring with center label only.
- Bar chart and trend chart stay as empty geometry, not text-heavy empties.
- Detail table keeps the header and shows no rows.
- No copy that makes empty states read like active values.

## Verification
- Production build completed successfully.
- Dashboard section was screenshot-verified in production mode.
- The donut center fill was fixed to render as the card surface color instead of black.
- The new model-usage dashboard renders with Recharts-backed charts and empty states.

## Remaining gap
- Profile page in this headless environment still depends on client hydration and auth state. The component is wired in code, but full browser hydration for that page was not fully reproduced here.
