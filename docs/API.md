# Pixora QR Platform — Phase 2 API Specification

This document details the HTTP endpoints added in Phase 2 for managing Restaurants, Tables, and generating secure QR Codes.

---

## 🌟 Super Admin Endpoints (Require SUPER_ADMIN role)

### 1. Create Restaurant
- **Method:** `POST`
- **Path:** `/api/v1/admin/restaurants`
- **Request Body:**
  ```json
  {
    "name": "Woodfired Pizza Place",
    "slug": "woodfired-pizza",
    "description": "Authentic sourdough pizzas.",
    "phone": "+91 9876543210",
    "email": "contact@woodfired.com",
    "address": "456 Gourmet Ave",
    "googleReviewUrl": "https://g.page/r/...",
    "currency": "INR",
    "timezone": "Asia/Kolkata",
    "theme": {
      "primaryColor": "#111827",
      "secondaryColor": "#FFFFFF",
      "accentColor": "#F59E0B",
      "fontFamily": "Plus Jakarta Sans"
    }
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "60d0fe23...",
      "name": "Woodfired Pizza Place",
      "slug": "woodfired-pizza",
      "isActive": true,
      "theme": { ... },
      "integrationConfig": { "provider": "NONE", "config": {} }
    },
    "message": "Restaurant created successfully"
  }
  ```

---

### 2. List Restaurants
- **Method:** `GET`
- **Path:** `/api/v1/admin/restaurants?page=1&limit=10`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "restaurants": [ ... ],
      "pagination": {
        "page": 1,
        "limit": 10,
        "total": 1,
        "totalPages": 1
      }
    },
    "message": "Restaurants listed successfully"
  }
  ```

---

### 3. Edit Restaurant
- **Method:** `PATCH`
- **Path:** `/api/v1/admin/restaurants/:id`
- **Request Body:** (Partial updates allowed)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": { ... },
    "message": "Restaurant updated successfully"
  }
  ```

---

### 4. Suspend/Activate Restaurant
- **Method:** `PATCH`
- **Path:** `/api/v1/admin/restaurants/:id/suspend` or `/api/v1/admin/restaurants/:id/activate`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": { "isActive": false },
    "message": "Restaurant suspended successfully"
  }
  ```

---

### 5. Assign/Create Manager
Assigns an existing user or creates a new manager user + links them to the restaurant in a single, atomic call.
- **Method:** `POST`
- **Path:** `/api/v1/admin/restaurants/:id/managers`
- **Request Body (Assign Existing User):**
  ```json
  {
    "userId": "60d0fe..."
  }
  ```
- **Request Body (Create & Assign New Manager inline):**
  ```json
  {
    "email": "newmanager@pizzaplace.com",
    "name": "John Doe",
    "password": "SecurePassword123!"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "60d0fe...",
      "userId": "60d0fe...",
      "restaurantId": "60d0fe...",
      "role": "MANAGER",
      "isActive": true
    },
    "message": "Manager assigned successfully"
  }
  ```

---

## 💼 Manager Endpoints (Require MANAGER/SUPER_ADMIN role + requireRestaurantAccess check)

All routes require active membership inside the specified `:restaurantId`.

### 1. Create Restaurant Table
- **Method:** `POST`
- **Path:** `/api/v1/restaurants/:restaurantId/tables`
- **Request Body:**
  ```json
  {
    "tableNumber": "15",
    "displayName": "Table 15 (Terrace)"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "60d0fe...",
      "restaurantId": "60d0fe...",
      "tableNumber": "15",
      "displayName": "Table 15 (Terrace)",
      "token": "secureUnguessableTokenXYZ...",
      "isActive": true,
      "qrCodeUrl": "/api/v1/restaurants/60d0fe.../tables/secureUnguessableTokenXYZ.../qr"
    },
    "message": "Table created successfully"
  }
  ```

---

### 2. Rotate Table Token & Regenerate QR Code
Rotates the unguessable table token, rendering the old QR code/token instantly revoked and returning TABLE_NOT_FOUND (404) if scanned.
- **Method:** `POST`
- **Path:** `/api/v1/restaurants/:restaurantId/tables/:tableId/regenerate-qr`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "token": "rotatedUnguessableToken123..."
    },
    "message": "QR code and table token regenerated successfully"
  }
  ```

---

### 3. Get Table QR details
Returns inline raw SVG markup and a secure PNG base64 data URI download payload for local offline table reprintings.
- **Method:** `GET`
- **Path:** `/api/v1/restaurants/:restaurantId/tables/:tableId/qr`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "svg": "<svg ...>",
      "pngDataUri": "data:image/png;base64,...",
      "url": "http://localhost:5173/r/woodfired-pizza/t/secureToken..."
    },
    "message": "QR retrieved successfully"
  }
  ```

---

## 🌐 Public Endpoints (No Auth Required)

### 1. Resolve Table URL Details
- **Method:** `GET`
- **Path:** `/api/v1/public/restaurants/:restaurantSlug/tables/:tableToken`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "restaurant": {
        "id": "60d0fe...",
        "name": "Woodfired Pizza Place",
        "slug": "woodfired-pizza",
        "logoUrl": "...",
        "coverImageUrl": "...",
        "theme": { ... }
      },
      "table": {
        "id": "60d0fe...",
        "displayName": "Table 15 (Terrace)",
        "tableNumber": "15"
      }
    },
    "message": "Table resolved successfully"
  }
  ```
- **Response (404 Not Found - On suspended restaurant, inactive table, or wrong token/slug):**
  ```json
  {
    "success": false,
    "error": {
      "code": "TABLE_NOT_FOUND",
      "message": "The specified table or restaurant was not found",
      "details": null
    }
  }
  ```
