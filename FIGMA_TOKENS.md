# FlowAPI Figma Tokens

## Color styles

### Brand
- `Flow/Primary/500` — `#6366f1`
- `Flow/Primary/600` — `#4f46e5`
- `Flow/Primary/700` — `#4338ca`
- `Flow/Secondary/500` — `#8b5cf6`
- `Flow/Cyan/500` — `#22d3ee`

### Semantic
- `Flow/Success/500` — `#22c55e`
- `Flow/Warning/500` — `#f59e0b`
- `Flow/Danger/500` — `#ef4444`

### Light surfaces
- `Flow/Light/Background` — `#f6f7fb`
- `Flow/Light/Surface` — `rgba(255,255,255,0.86)`
- `Flow/Light/Surface-strong` — `rgba(255,255,255,0.96)`
- `Flow/Light/Border` — `rgba(15,23,42,0.08)`
- `Flow/Light/Text` — `#111827`
- `Flow/Light/Muted` — `#64748b`

### Dark surfaces
- `Flow/Dark/Background` — `#0b1020`
- `Flow/Dark/Surface` — `rgba(15,23,42,0.72)`
- `Flow/Dark/Surface-strong` — `rgba(15,23,42,0.92)`
- `Flow/Dark/Border` — `rgba(148,163,184,0.16)`
- `Flow/Dark/Text` — `#e5e7eb`
- `Flow/Dark/Muted` — `#94a3b8`

## Gradient styles
- `Flow/Brand Gradient` — `linear-gradient(135deg, #1d4ed8 0%, #4f46e5 46%, #7c3aed 100%)`
- `Flow/Brand Gradient Inline` — `linear-gradient(90deg, #1d4ed8 0%, #4f46e5 50%, #7c3aed 100%)`
- `Flow/Brand Glow` — `rgba(79,70,229,0.28)`

## Typography styles

### Headings
- `Flow/H1` — 32 / 40, 800, tracking -2%
- `Flow/H2` — 24 / 32, 800, tracking -2%
- `Flow/H3` — 18 / 26, 700
- `Flow/Section Label` — 11 / 16, 800, uppercase, tracking 8%

### Body
- `Flow/Body/Default` — 14 / 22, 400
- `Flow/Body/Strong` — 14 / 22, 600
- `Flow/Body/Small` — 12 / 18, 400
- `Flow/Meta` — 12 / 18, 600

### Numeric
- `Flow/Metric` — 28 / 34, 800, tabular nums
- `Flow/Metric Large` — 36 / 42, 900, tabular nums
- `Flow/Table Number` — 13 / 20, 700, tabular nums

## Radius
- `Flow/Radius/Small` — 8
- `Flow/Radius/Medium` — 12
- `Flow/Radius/Large` — 16
- `Flow/Pill` — 999

## Shadows
- `Flow/Shadow/Light` — `0 12px 40px rgba(15,23,42,0.06)`
- `Flow/Shadow/Soft` — `0 16px 48px rgba(15,23,42,0.08)`
- `Flow/Shadow/Dark` — `0 12px 40px rgba(0,0,0,0.24)`

## Spacing
- 4, 8, 12, 16, 20, 24, 32, 40, 48

## Layout sizes
- Sidebar width: 280
- Top bar height: 64
- Card min height: 96
- Metric card height: 112
- Chart card height: 320-380
- Table row height: 48-56

## Common component tokens

### Buttons
- Primary: gradient fill, white text
- Secondary: surface fill, brand border
- Ghost: transparent, muted text
- Disabled: low-opacity surface, muted text, no shadow

### Status dots
- Available: green
- Maintenance: amber
- Unavailable: red
- Idle: muted gray

### Tooltip
- Background: dark glass
- Border: low-contrast
- Radius: 10-12
- Padding: 12-16

## Usage rules
- Do not introduce new brand colors without mapping them back to Flow tokens.
- Keep all metric numbers tabular.
- Prefer one text style for labels and one for values in each card.
- Keep chart labels short and truncate long model names.

