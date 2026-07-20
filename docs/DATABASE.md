# DATABASE.md - Pixora QR Data Models

This document specifies the schema, validation rules, and indexes for Phase 1 data models in MongoDB (using Mongoose).

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
