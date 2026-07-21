# AUTH.md - Authentication & Authorization API Specification

The platform utilizes a secure JWT-based stateless session strategy with short-lived access tokens and longer-lived `HttpOnly` Secure cookies for refresh tokens.

## Base URL
`/api/v1/auth`

---

## Endpoints

### 1. Login User
Authenticates a user and issues token pairs.

- **Method:** `POST`
- **Path:** `/login`
- **Request Body (JSON):**
  ```json
  {
    "email": "admin@pixora.dev",
    "password": "PixoraDemo123!"
  }
  ```
- **Response Headers:**
  - `Set-Cookie`: `refreshToken=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800`
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "eyJhbGciOi...",
      "user": {
        "id": "60d0fe23...",
        "email": "admin@pixora.dev",
        "name": "Super Admin",
        "role": "SUPER_ADMIN",
        "isActive": true
      }
    },
    "message": "Login successful"
  }
  ```
- **Error Responses:**
  - `400 Bad Request` (Invalid payload format)
  - `401 Unauthorized` (Invalid email or password)

---

### 2. Refresh Access Token
Uses the refresh token from `HttpOnly` cookies to issue a new short-lived access token.

- **Method:** `POST`
- **Path:** `/refresh`
- **Request Headers / Cookies:**
  - Cookie: `refreshToken=<token>`
- **Response Headers:** (Includes rotated refresh token)
  - `Set-Cookie`: `refreshToken=<new-token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800`
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "eyJhbGciOi..."
    },
    "message": "Token refreshed successfully"
  }
  ```
- **Error Responses:**
  - `401 Unauthorized` (Missing, expired, or invalid/revoked refresh token)

---

### 3. Logout User
Revokes the refresh token and clears the authentication cookies.

- **Method:** `POST`
- **Path:** `/logout`
- **Request Headers / Cookies:**
  - Cookie: `refreshToken=<token>`
- **Response Headers:**
  - `Set-Cookie`: `refreshToken=; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=0`
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {},
    "message": "Logged out successfully"
  }
  ```

---

### 4. Get Current User Details
Fetches the profile of the currently authenticated session.

- **Method:** `GET`
- **Path:** `/me`
- **Request Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "60d0fe23...",
        "email": "admin@pixora.dev",
        "name": "Super Admin",
        "role": "SUPER_ADMIN",
        "isActive": true
      }
    },
    "message": "User details fetched successfully"
  }
  ```
- **Error Responses:**
  - `401 Unauthorized` (Missing or expired access token)

---

### 5. Change Password
Changes password for the currently logged-in user.

- **Method:** `POST`
- **Path:** `/change-password`
- **Request Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Request Body (JSON):**
  ```json
  {
    "currentPassword": "PixoraDemo123!",
    "newPassword": "NewSecurePassword456!"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {},
    "message": "Password changed successfully"
  }
  ```
- **Error Responses:**
  - `400 Bad Request` (Invalid criteria or format)
  - `401 Unauthorized` (Invalid current password or token expired)

---

### 6. Get Restaurant Analytics
Fetches aggregate analytics and metrics for managers.

- **Method:** `GET`
- **Path:** `/api/v1/restaurants/:restaurantId/analytics`
- **Request Headers:**
  - `Authorization`: `Bearer <accessToken>`
- **Query Parameters:**
  - `startDate`: ISO datetime string of the current period start
  - `endDate`: ISO datetime string of the current period end
  - `priorStartDate`: ISO datetime string of the prior period start (optional)
  - `priorEndDate`: ISO datetime string of the prior period end (optional)
- **Role Permissions:** `MANAGER` or `SUPER_ADMIN`
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "summary": {
        "revenue": { "current": 24000, "prior": 12000, "change": 100 },
        "orderCount": { "current": 10, "prior": 5, "change": 100 },
        "aov": { "current": 2400, "prior": 2400, "change": 0 },
        "fulfillmentTime": { "current": 15.5, "prior": 18.2, "change": -14.84 }
      },
      "charts": {
        "timeline": [
          { "label": "2026-07-21", "revenue": 24000, "orderCount": 10 }
        ],
        "topSelling": [
          { "name": "Margherita", "quantity": 12, "revenue": 12000 }
        ],
        "statusBreakdown": [
          { "status": "PENDING", "count": 2 }
        ]
      },
      "tables": [
        { "tableId": "60d0fe...", "displayName": "Table 1", "tableNumber": "1", "orderCount": 5, "revenue": 12000, "aov": 2400 }
      ],
      "ordersList": [
        { "orderNumber": 1, "tableName": "Table 1", "createdAt": "2026-07-21T10:00:00.000Z", "status": "SERVED", "itemCount": 2, "total": 2400 }
      ]
    },
    "message": "Analytics retrieved successfully"
  }
  ```
- **Error Responses:**
  - `400 Bad Request` (Missing/invalid query parameter dates)
  - `401 Unauthorized` (Invalid/expired token)
  - `403 Forbidden` (User does not have access to restaurant or lacks MANAGER/SUPER_ADMIN role)
