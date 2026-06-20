# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-06-14
- Primary product surfaces: `/dashboard`, `/profile`, `/recharge`, `/models`, `/api-management`, `/admin/*`, `/team/*`, `/images`, `/help`
- Evidence reviewed: `README.md`, `styles/globals.css`, `pages/dashboard.js`, `pages/profile.js`, `pages/recharge.js`, `pages/models.js`, `components/ConsoleLayout.js`, `components/dashboard/model-usage-visualization.tsx`, `pages/admin/index.js`

## Brand
- Personality: FlowAPI is a cold-tech commercial console, not a marketing site. It should feel precise, dense, premium, and operational.
- Trust signals: real data density, visible tokens and costs, clear model branding, clear states, calm motion, strong hierarchy.
- Avoid: generic AI purple gradients, oversized hero sections, card-heavy landing-page composition, decorative clutter, weak contrast, and copy that over-explains.

## Product goals
- Goals: help users inspect models, keys, balances, usage, costs, and team/admin status quickly; keep monetization and routing readable.
- Non-goals: entertainment-style visuals, brand illustration pages, or layout changes that reorder the current business flow.
- Success signals: high scanability, low ambiguity, consistent theme across dashboard/profile/models/admin, and no overflow in cards or tables.

## Personas and jobs
- Primary personas: individual API users, team operators, admins, commercial operators.
- User jobs: create keys, inspect usage, compare models, recharge, read costs, manage teams, monitor upstream health, and review profitability.
- Key contexts of use: daily operations, billing checks, model selection, debugging API issues, admin review.

## Information architecture
- Primary navigation: dashboard, API management, recharge, models, images, profile, help, team, admin.
- Core routes/screens: `/dashboard`, `/profile`, `/recharge`, `/models`, `/api-management`, `/admin`, `/team`, `/images`.
- Content hierarchy: summary metrics first, then charts/tables, then detail drawers or secondary actions.

## Design principles
- Principle 1: dense but calm. Show more information without making the page feel crowded.
- Principle 2: make the monetary and token flows obvious. Users should read balance, usage, and cost in one glance.
- Tradeoffs: preserve existing content order and business logic; visual polish must not break current navigation or data contracts.

## Visual language
- Color: FlowAPI blue-purple gradient as the primary brand signal; cyan for success/output; green for availability; amber for warnings; red for failures; neutral surfaces for everything else.
- Typography: modern sans with strong numeric clarity; tabular numbers for all metrics; compact headings; no playful display type.
- Spacing/layout rhythm: 8px base grid, with operational panels using 16/24/32px spacing and a 1200-1440px desktop content width.
- Shape/radius/elevation: small-radius system, typically 8-12px for cards and 999px for pills; shallow but crisp elevation.
- Motion: subtle hover lift, smooth opacity/translate transitions, no bouncing or distracting animation; respect reduced-motion.
- Imagery/iconography: minimal line icons and status dots; product screenshots only when they explain a functional state.

## Components
- Existing components to reuse: `ConsoleLayout`, `ModelLogo`, `ModelUsageVisualization`, `WalletProgressCard`, `CardDetailModal`, `LiveNumber`, `InteractiveCard`, `ThemeToggle`, `LanguageSwitcher`.
- New/changed components: design should support a reusable `ModelUsageDashboard` pattern for dashboard/profile, and a Figma mirror of the dashboard cards, chart cards, and summary panels.
- Variants and states: light/dark, loading, empty, error, disabled, success, warning, compact/mobile.
- Token/component ownership: keep brand tokens in `styles/globals.css`; page-specific visuals should consume tokens, not redefine them.

## Accessibility
- Target standard: WCAG 2.1 AA as a practical baseline.
- Keyboard/focus behavior: visible focus states, no hover-only critical actions.
- Contrast/readability: charts, table text, and metric numbers must remain legible in both themes.
- Screen-reader semantics: charts need text equivalents or accessible summaries.
- Reduced motion and sensory considerations: no essential interaction should depend on motion.

## Responsive behavior
- Supported breakpoints/devices: mobile, tablet, desktop, wide desktop.
- Layout adaptations: 4-column summary cards on desktop, 2-column on tablet, 1-column on mobile; tables collapse to stacked cards when space is tight.
- Touch/hover differences: mobile tooltips should prefer tap/open patterns; hover affordances should not be required to read data.

## Interaction states
- Loading: skeletons or subtle placeholders, never blank jumps.
- Empty: show zero-state values and empty chart geometry, not long prose.
- Error: concise error banner with retry path.
- Success: quiet confirmation, not celebratory noise.
- Disabled: visually distinct but still legible.
- Offline/slow network, if applicable: keep cached local fallback visible when possible.

## Content voice
- Tone: concise, factual, commercial, operator-focused.
- Terminology: use FlowAPI, API Key, Token, model, wallet, team, upstream, cost, and usage consistently.
- Microcopy rules: short labels, precise numerals, avoid vague marketing language.

## Implementation constraints
- Framework/styling system: Next.js pages router with shared layout components and CSS variables in `styles/globals.css`.
- Design-token constraints: consume existing FlowAPI color and surface tokens; do not introduce a second brand palette.
- Performance constraints: charts and tables should stay responsive and should not cause page scroll jumps or large reflows.
- Compatibility constraints: preserve current route structure, data contracts, and admin/user separation.
- Test/screenshot expectations: verify both light and dark modes, mobile width, empty data, and long-label truncation.

## Figma-ready system
- Workspace frame: 1440 × 1600 desktop base, 1200 × 1600 secondary desktop, 768 × 1600 tablet, 390 × 1600 mobile.
- Grid: 12 columns desktop, 8 columns tablet, 4 columns mobile; 24px gutters desktop, 16px tablet/mobile.
- Page order in Figma:
  1. Login / entry
  2. Dashboard
  3. Model Marketplace
  4. Recharge
  5. Profile
  6. API Management
  7. Team Space
  8. Admin Console
- Component set in Figma:
  - top nav / sidebar
  - metric card
  - chart card
  - table card
  - status pill
  - status dot
  - model row
  - wallet summary block
  - button primary / secondary / ghost / disabled
  - tooltip
  - drawer / modal

## Open questions
- [ ] Which exact font family should be locked for Figma exports if the current runtime stack changes?
- [ ] Should the Figma file include separate dark and light theme pages, or one component library with theme variants?
- [ ] Which dashboard charts are the final source of truth when multiple visualizations overlap conceptually?
