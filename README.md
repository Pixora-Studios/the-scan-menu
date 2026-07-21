# Pixora QR Platform — Phase 1 (Standalone Auth & Operations Shell)

Welcome to Phase 1 of the production-ready, mobile-first standalone QR restaurant ordering & operations platform for Pixora Studios. This phase establishes the monorepo workspace structure, the central design system tokens, database schemas, security-focused authentication mechanics, and a secure operational shell.

---

## 🚀 MONOREPO WORKSPACE SETUP

The project is architected as a clean Monorepo using npm workspaces:
- `/client`: Themed Vite + React + TypeScript web application.
- `/server`: Secure Express + Node.js + TypeScript API backend.

From the root of the repository, the following workspace-delegated commands are available:
- **Build the whole platform:** `npm run build`
- **Lint the whole platform (Strictly fails on any warnings or errors):** `npm run lint`
- **Run the whole test suite:** `npm run test`

---

## 🔒 LOCAL DEVELOPMENT & SEED DATA
> ⚠️ **Local dev only — never use in production**

Phase 1 includes an idempotent seeding script to bootstrap development. The script creates one `SUPER_ADMIN` user and a complete "Demo Cafe" restaurant with five categories, twenty menu items, and predefined manager and staff logins:

- **Super Admin:** `admin@pixora.dev` / `PixoraDemo123!`
- **Demo Cafe Manager:** `manager@democafe.com` / `PixoraDemo123!`
- **Demo Cafe Staff One:** `staff1@democafe.com` / `PixoraDemo123!`
- **Demo Cafe Staff Two:** `staff2@democafe.com` / `PixoraDemo123!`

### Running the Seed Script
To run the seed script locally, run this command from the root of the repository:
```bash
npm run --workspace=server seed
```

---

## 📁 REPOSITORY LAYOUT

```
/
├── client/src/
│   ├── app/           # Main global routing and context provider
│   ├── components/    # Reusable UI components
│   ├── features/      # Feature modules (auth, etc.)
│   ├── layouts/       # Structural layouts
│   ├── pages/         # Page components (Login, Dashboard)
│   ├── routes/        # Router files and Route gating logic
│   ├── hooks/         # Custom React hooks (useAuth)
│   ├── lib/           # Third-party configurations (Axios clients)
│   ├── services/      # Service calls and business logic
│   ├── store/         # State management
│   ├── types/         # TypeScript declarations
│   └── utils/         # Helper functions
│
├── server/src/
│   ├── config/        # Environment and DB config
│   ├── controllers/   # Express Controller Layer (AuthController)
│   ├── services/      # Business logic and Token service (TokenService)
│   ├── repositories/  # Repository pattern (UserRepository, RefreshTokenRepository)
│   ├── models/        # Mongoose data schemas (User, RefreshToken)
│   ├── routes/        # Express routers (auth.routes)
│   ├── middleware/    # Security, Validation, and Auth middlewares
│   ├── validators/    # Zod payload validators
│   ├── sockets/       # WebSocket services and events
│   ├── integrations/  # External white-label POS integrations
│   ├── utils/         # Seeding, custom logging, and envelope formatting
│   └── types/         # Custom TypeScript type overrides
│
├── docs/
│   ├── DATABASE.md    # MongoDB / Mongoose schemas & indexing rules
│   ├── AUTH.md        # 5 Endpoints API Specification with request/response shapes
│   └── DESIGN_SYSTEM.md # Detailed typography, icons, motion, and color rules
│
├── AGENTS.md          # Persistent development conventions for future Jules tasks
└── package.json       # Root monorepo workspace configuration
```

---

## 🔑 ARCHITECTURE & SECURITY HIGHLIGHTS

1. **Separation of Concerns:** Zero business logic resides in Express route handlers or React components. Business rules are decoupled into repositories, services, and hooks.
2. **Strict API Envelopes:** Every single endpoint returns standard payloads:
   - *Success:* `{ success: true, data: {}, message: "..." }`
   - *Error:* `{ success: false, error: { code: "X", message: "...", details: null } }`
3. **Fail-Fast Startup Checks:** The backend server checks that `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `MONGODB_URI` are present during startup and exits immediately if any are missing.
4. **JWT & HttpOnly Session Management:** Secure access-token authentication (15-minute lifespan) paired with token-rotating `HttpOnly` Secure cookies (7-day lifespan) to protect sessions from XSS.
5. **No Redirect Flash Silent Refresh:** Upon initial page reload or app mount, the front-end checks if there is no access token in memory and automatically runs a silent refresh `/auth/refresh` request behind a loading state, avoiding any layout redirect flash before verifying the user is logged out.
6. **Custom Tailwind Design System:** Typography scales, palettes, and easing micro-interactions (including horizontal horizontal-shake error animations) are mapped directly into `client/tailwind.config.js`.

---

## ✅ DEFINITION OF DONE VERIFICATION

- [x] **Seeded Login & Access /me:** The seeded `SUPER_ADMIN` can login using the API, fetch `/auth/me`, and navigate the dashboard shell.
- [x] **Role Gating test:** Integration tests prove that a non-`SUPER_ADMIN` user is rejected on a `SUPER_ADMIN`-only route.
- [x] **Linter Cleanliness:** Root `npm run lint` compiles cleanly with zero warnings/errors.
- [x] **Compilation:** Both client and server packages build without any errors.
