# Design System Master File

> **PROJECT:** Split
> **Generated:** 2026-07-16
> **Source:** Canvas-approved minimal grid UI + ui-ux-pro-max (brand overrides applied)

---

## Brand (keep — do not replace)

| Token | Value |
|-------|-------|
| `--brand-purple` | `#a78bfa` |
| `--brand-purple-soft` | `#c4acf6` |
| `--brand-lavender` | `#ede4ff` |
| `--brand-graphite` | `#1a1a1a` |
| `--brand-muted` | `#5c5c5c` |
| `--brand-white` | `#ffffff` |

Semantic shadcn map in `src/styles.css` stays purple-on-graphite/white.

### Typography (keep)

- **Display / headings:** Bricolage Grotesque Variable (`--font-display`)
- **Body / UI:** DM Sans Variable (`--font-sans`)

Do **not** switch to Inter or teal/orange palettes from generic tool defaults.

---

## Pattern

**Minimal Single Column** — mobile-first, one CTA focus, lots of whitespace, no nav clutter.

## Style

Swiss / flat minimal. Flat token `background`. Optional very low-contrast stipple. No glass, no purple glow shadows, no multi-radial hero wash.

## Layout

- `--base-unit: 8px`
- `--control-height: 3rem` (48px) — form control source of truth
- `--grid-gap: 1rem`
- `.content-grid` — 4 cols mobile / 12 from `sm`
- Max widths: `--max-width` 40rem, `--max-width-narrow` 28rem

## Control height (primitives — no page overrides)

| Primitive | Height |
|-----------|--------|
| Input / Select default | `h-12` / `--control-height` |
| TabsList horizontal | `h-12`; Triggers `text-sm` |
| Button default | `h-12` + `text-base` (sm/xs/icon stay compact) |

Delete page-level `h-9` / `h-11` / unnecessary `size="lg"` on form CTAs.

## Anti-patterns (AI slop)

- Decorative cards / `landing-panel` around forms
- Nested card stacks for list rows
- Balance progress bars under names
- Mixing control heights in one form flow
- Emoji as icons (use Hugeicons)
- Gradients / glow as primary atmosphere

## Cards rule

Cards only when interaction requires a container. If removing border + fill does not hurt understanding, do not use a card. Landing Create/Join is open space.

## Motion

150–300ms fades; enter y-offset ≤ 8px. Respect `prefers-reduced-motion`.

## Pre-Delivery Checklist

- [ ] No emojis as icons
- [ ] cursor-pointer on clickable elements
- [ ] Touch targets ≥ 44px (controls at 48px)
- [ ] Light + dark contrast 4.5:1 body text
- [ ] Focus rings visible
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px+
