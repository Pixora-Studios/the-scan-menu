# DESIGN_SYSTEM.md - Pixora QR Design Tokens & System

This document specifies the typography, palette, layouts, icons, and transition constraints for Phase 1 and subsequent releases.

## Typography
- **Headings / Display Font:** `"Instrument Serif"`, fallback `"Fraunces"`.
  - Use class: `font-display tracking-tight`.
- **UI / Body Font:** `"Plus Jakarta Sans"`.
  - Use class: `font-sans`.
- **Mono Font (Timestamps / IDs):** `"JetBrains Mono"`.
  - Use class: `font-mono`.

### Tailwind Type Scale Configuration
- `text-xs`: `0.75rem` (Line height: default)
- `text-sm`: `0.875rem`
- `text-base`: `1.0rem`
- `text-lg`: `1.125rem`
- `text-xl`: `1.25rem`
- `text-2xl`: `1.5rem`
- `text-3xl`: `1.875rem`
- `text-4xl`: `2.25rem`
- `text-5xl`: `3.0rem`

---

## Palette / Color Tokens
Default fallback theme (used before white-label branding takes effect in Phase 2):
- **Primary:** `#111827` (slate-900)
- **Accent:** `#F59E0B` (amber-500)
- **Surface:** `#FFFFFF` (white)
- **Dark Surface:** `#0B0B0F` (very dark slate-950)

---

## Icons
- **Icon Library:** Lucide React only.
- **Stroke Width:** `strokeWidth={1.75}` everywhere. Keep it clean, thin, and uniform.

---

## Motion / Easing Definitions
We use Framer Motion for UI-transitions. All animations must comply with the durations and easing constraints below.

### Durations
- **Micro-interactions** (Button hovers, checkbox transitions): `120ms` - `180ms`
- **Component transitions** (Modals, error state shakes, item enters): `220ms` - `320ms`
- **Page / Route transitions**: `350ms` - `450ms`
- **Maximum Duration:** Never exceed `500ms`.

### Easings
- **Entrance Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` (Ultra-smooth ease-out)
- **Exit Easing:** `cubic-bezier(0.65, 0, 0.35, 1)` (Ultra-smooth ease-in)

### Shake Animation (Form Validation Error)
When a user attempts to submit a form with validation errors, the form or specific inputs must perform a subtle horizontal shake using Framer Motion.
- **Direction:** X-axis translation.
- **Duration:** `300ms`.
- **Steps/Offset:** Alternate offset sequences (e.g. `[0, -8, 8, -6, 6, -3, 3, 0]`).
