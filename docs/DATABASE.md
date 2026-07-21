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

---

### 6. Order
Represents actual self-placed customer dining tickets inside our multi-tenant SaaS.

- **Collection Name:** `orders`
- **Fields:**
  - `restaurantId`: `ObjectId` (Required, ref: `'Restaurant'`)
  - `tableId`: `ObjectId` (Required, ref: `'Table'`)
  - `orderNumber`: `Number` (Required, sequential per-restaurant integer counter)
  - `items`: `Array` of Object:
    - `menuItemId`: `ObjectId` (Required, ref: `'MenuItem'`)
    - `nameSnapshot`: `String` (Required, snapshots menu item name at order time)
    - `unitPriceSnapshot`: `Number` (Required, snapshots item unit price including chosen add-ons in cents/paise)
    - `quantity`: `Number` (Required, minimum: 1)
    - `selectedAddOns`: `Array` of Object:
      - `name`: `String`
      - `priceDelta`: `Number`
    - `specialInstructions`: `String` (Optional, per-item note)
  - `subtotal`: `Number` (Required, computed sum in cents/paise)
  - `tax`: `Number` (Required, calculated tax sum in cents/paise)
  - `total`: `Number` (Required, grand total sum in cents/paise)
  - `customerNote`: `String` (Optional, order-level note)
  - `status`: `String` (Required, enum: `PENDING` | `ACCEPTED` | `PREPARING` | `READY` | `SERVED` | `CANCELLED`, default: `PENDING`)
  - `source`: `String` (Required, enum: `QR` | `POS` | `API` | `MANUAL`, default: `QR`)
  - `integrationMetadata`: `Object` (Required, default: `{}`)
  - `createdAt`: `Date` (Automated timestamp)
  - `updatedAt`: `Date` (Automated timestamp)

- **Indexes:**
  - Compound unique index on `restaurantId + orderNumber` (Enforces unique sequential order numbering per restaurant tenant)
  - Compound index on `restaurantId + status` (Optimizes active kitchen queues querying)
  - Compound index on `restaurantId + createdAt` (Optimizes history page pagination and reporting queries)

---

### 7. OrderCounter
A helper atomic sequential index tracker keeping independent sequence series per restaurant.

- **Collection Name:** `order_counters`
- **Fields:**
  - `restaurantId`: `ObjectId` (Required, ref: `'Restaurant'`, unique lookup)
  - `seq`: `Number` (Required, atomic increment counter, default: `0`)
