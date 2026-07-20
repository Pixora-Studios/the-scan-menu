# AGENTS.md

This file captures the hard rules, design systems, and persistent development conventions for the Pixora QR platform. All future AI and developer agents working on this project must adhere strictly to these rules.

## HARD RULES
1. **No Business Logic in React Components or Express Route Handlers**
   - React components must only handle rendering, UI-state, and layout. Fetching/mutation logic should reside inside custom React Hooks and Services.
   - Express route handlers must only handle parsing requests, checking authorization, calling appropriate controllers/services, and writing the standard envelope response. All business rules must be inside Controllers/Services/Repositories.
2. **No Mock Data or Bypassing Auth in Production**
   - No mock data or fake API calls should exist in the production/main codebase. All operations must connect to real repositories/DB models.
3. **Standard API Envelope Everywhere**
   - All response payloads must follow this format:
     - **Success (HTTP 2xx):**
       ```json
       {
         "success": true,
         "data": { ... },
         "message": "Success message"
       }
       ```
     - **Error (HTTP 4xx/5xx):**
       ```json
       {
         "success": false,
         "error": {
           "code": "ERROR_CODE",
           "message": "User friendly error message",
           "details": null
         }
       }
       ```
4. **Document Every Endpoint**
   - Every single endpoint added must be documented under `/docs/AUTH.md` immediately.
5. **Never Expose JWT Secrets**
   - Never expose `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` or any database connection URIs to the frontend client.

## DESIGN SYSTEM

### Typography
- **Display/Headings Font:** "Instrument Serif" (fallback "Fraunces"). Headings use `font-display tracking-tight`.
- **UI/Body Font:** "Plus Jakarta Sans". Body uses `font-sans`.
- **Mono Font:** "JetBrains Mono" (e.g. for order numbers/timestamps).

### Tailwind Type Scale
- `text-xs`: `0.75rem`
- `text-sm`: `0.875rem`
- `text-base`: `1.0rem`
- `text-lg`: `1.125rem`
- `text-xl`: `1.25rem`
- `text-2xl`: `1.5rem`
- `text-3xl`: `1.875rem`
- `text-4xl`: `2.25rem`
- `text-5xl`: `3.0rem`

### Icons
- **Lucide React** only.
- Default style: `strokeWidth={1.75}` everywhere.

### Motion (Framer Motion)
- **Micro-interactions:** 120-180ms
- **Component transitions:** 220-320ms
- **Page transitions:** 350-450ms
- **Max limit:** Never exceed 500ms.
- **Entrance Easing:** `cubic-bezier(0.16, 1, 0.3, 1)`
- **Exit Easing:** `cubic-bezier(0.65, 0, 0.35, 1)`

### Color Theme
- **Primary:** `#111827`
- **Accent:** `#F59E0B`
- **Surface:** `#FFFFFF` (Dark surfaces/modes: `#0B0B0F`)
