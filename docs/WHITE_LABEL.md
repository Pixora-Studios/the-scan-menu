# Pixora QR Platform — White-Label SaaS Branding Integration

This document outlines the design tokens, database structures, and styling rules that make Pixora a fully white-labeled multi-tenant QR platform.

---

## 🎨 Theme Configuration Schema

Branding colors and style choices are configured individually per restaurant tenant under the `theme` field inside the `Restaurant` model:

```typescript
{
  primaryColor: String,   // Slate / Primary buttons (e.g. '#111827')
  secondaryColor: String, // Background layouts (e.g. '#FFFFFF')
  accentColor: String,    // Highlights and active indicators (e.g. '#F59E0B')
  fontFamily: String,     // e.g. 'Plus Jakarta Sans', 'Instrument Serif', etc.
  logoUrl: String,        // S3/Cloudinary merchant logo link
  coverImageUrl: String,  // S3/Cloudinary public dining page cover
}
```

---

## 📂 Public Resolution

When a guest scans a physical QR code at a dining table, the system queries the `PublicController.resolveTable` route. This resolves:
1. The **Restaurant Slug** (matching the URL e.g. `/r/woodfired-pizza`).
2. The **Table Token** (cryptographically secure nanoid, e.g. `zX90pS7q1...`).

This endpoint returns the restaurant's entire `theme` configuration. The customer's mobile device then dynamically maps these properties into the DOM or Tailwind styles to skin the menu header, item grids, and checkout drawers in milliseconds!

---

## 📝 Editing Branding

Managers can edit their restaurant settings in real-time from the **Settings** section of their admin operations panel.
- Inputs for `logoUrl` and `coverImageUrl` connect directly to Cloudinary direct signed uploads.
- Color properties utilize native hex-color picker inputs (`type="color"`), updating CSS properties immediately upon save.
- Font selections support typography choices like *Fraunces* or *Instrument Serif*, ensuring seamless visual integration across the menu views.
