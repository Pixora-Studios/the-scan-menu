# DATABASE.md - Pixora QR Data Models

This document specifies the schema, validation rules, and indexes for data models in MongoDB (using Mongoose).

## Models

### 1. User
Represents an identity on the platform with specific role authorization.

- **Collection Name:** `users`
- **Fields:**
  - `email`: `String` (Required, unique, trimmed, lowercase, verified email format)
  - `passwordHash`: `String` (Required, bcrypt hash of password)
  - `role`: `String` (Required, enum: `SUPER_ADMIN` | `MANAGER` | `STAFF`)
  - `name`: `String` (Required, trimmed, 1-100 characters)
  - `isActive`: `Boolean` (Required, default: `true`)
  - `createdAt`: `Date` (Automated timestamp)
  - `updatedAt`: `Date` (Automated timestamp)

- **Indexes:**
  - Unique index on `email` (case-insensitive)

---

### 2. RefreshToken
Represents a token issued for refreshing short-lived access tokens. Implements secure token-rotation mechanisms.

- **Collection Name:** `refresh_tokens`
- **Fields:**
  - `userId`: `ObjectId` (Required, ref: `User`)
  - `tokenHash`: `String` (Required, SHA-256 hash of the refresh token string for lookup)
  - `expiresAt`: `Date` (Required, expiration date/time)
  - `createdAt`: `Date` (Automated timestamp)
  - `revokedAt`: `Date` (Optional, timestamp of when the token was manually/automatically revoked)

- **Indexes:**
  - Unique index on `tokenHash` (Unique lookup index)
  - TTL index on `expiresAt` (to automatically clean up expired documents)

---

### 3. Restaurant
Represents a distinct restaurant tenant in our multi-tenant SaaS.

- **Collection Name:** `restaurants`
- **Fields:**
  - `name`: `String` (Required, trimmed)
  - `slug`: `String` (Required, unique, lowercase, trimmed)
  - `logoUrl`: `String` (Optional, trimmed)
  - `coverImageUrl`: `String` (Optional, trimmed)
  - `description`: `String` (Optional, trimmed)
  - `phone`: `String` (Optional, trimmed)
  - `email`: `String` (Optional, trimmed)
  - `address`: `String` (Optional, trimmed)
  - `googleReviewUrl`: `String` (Optional, trimmed)
  - `currency`: `String` (Required, default: `'INR'`)
  - `timezone`: `String` (Required, default: `'Asia/Kolkata'`)
  - `theme`: `Object` (Required)
    - `primaryColor`: `String` (Required, default: `'#111827'`)
    - `secondaryColor`: `String` (Required, default: `'#FFFFFF'`)
    - `accentColor`: `String` (Required, default: `'#F59E0B'`)
    - `fontFamily`: `String` (Required, default: `'Plus Jakarta Sans'`)
    - `logoUrl`: `String` (Optional)
    - `coverImageUrl`: `String` (Optional)
  - `isActive`: `Boolean` (Required, default: `true`)
  - `integrationConfig`: `Object` (Required)
    - `provider`: `String` (Required, default: `'NONE'`)
    - `config`: `Mixed` (Required, default: `{}`)
  - `createdAt`: `Date` (Automated timestamp)
  - `updatedAt`: `Date` (Automated timestamp)

- **Indexes:**
  - Unique index on `slug` (case-insensitive)

---

### 4. RestaurantStaff
A join-table representation tracking a User's roles at specific restaurants.

- **Collection Name:** `restaurant_staff`
- **Fields:**
  - `userId`: `ObjectId` (Required, ref: `'User'`)
  - `restaurantId`: `ObjectId` (Required, ref: `'Restaurant'`)
  - `role`: `String` (Required, enum: `MANAGER` | `STAFF`)
  - `isActive`: `Boolean` (Required, default: `true`)
  - `createdAt`: `Date` (Automated timestamp)
  - `updatedAt`: `Date` (Automated timestamp)

- **Indexes:**
  - Compound unique index on `userId + restaurantId` (enforces single staff role mapping per restaurant)

---

### 5. Table
Represents physical table placements in a restaurant, matching secure, rotate-ready unguessable public QR code tokens.

- **Collection Name:** `tables`
- **Fields:**
  - `restaurantId`: `ObjectId` (Required, ref: `'Restaurant'`)
  - `tableNumber`: `String` (Required, trimmed)
  - `displayName`: `String` (Required, trimmed)
  - `token`: `String` (Required, unique, indexed, secure unguessable 21+ base64url characters)
  - `isActive`: `Boolean` (Required, default: `true`)
  - `qrCodeUrl`: `String` (Required, local relative backend path mapping SVG + PNG data links)
  - `createdAt`: `Date` (Automated timestamp)
  - `updatedAt`: `Date` (Automated timestamp)

- **Indexes:**
  - Unique index on `token` (Primary table public-facing resolver lookup)
  - Index on `restaurantId`
  - Compound unique index on `restaurantId + tableNumber` (enforces unique table number identifiers inside each restaurant tenant)
