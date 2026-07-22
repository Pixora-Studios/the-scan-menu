# Pixora QR Platform — API Specification

This document details the HTTP endpoints for managing Restaurants, Tables, Categories, Menu Items, and generating secure QR Codes/Direct Uploads.

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
    },
    "gstNumber": "27AAAAA1111A1Z1",
    "whatsapp": "+91 9876543210",
    "timings": {
      "open": "09:00",
      "close": "23:00"
    },
    "socialLinks": {
      "facebook": "https://facebook.com/woodfired",
      "instagram": "https://instagram.com/woodfired",
      "twitter": "https://twitter.com/woodfired"
    },
    "paymentMethods": {
      "cash": true,
      "card": true,
      "upi": true,
      "razorpay": false
    },
    "razorpayConfig": {
      "keyId": "rzp_test_...",
      "keySecret": "..."
    },
    "subscription": {
      "status": "ACTIVE",
      "planType": "PREMIUM",
      "expiresAt": "2026-12-31T23:59:59.000Z"
    }
  }
  ```

---

## 🛎️ Waiter Calls Endpoints

### 1. Request Waiter Assistance (Public, no auth)
Tells floor service staff that help is required. Includes table snapshot and status tracking.
- **Method:** `POST`
- **Path:** `/api/v1/public/tables/:tableToken/waiter-call`
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "60d0fe...",
      "restaurantId": "60d0fe...",
      "tableId": "60d0fe...",
      "tableNumberSnapshot": "15",
      "status": "PENDING"
    },
    "message": "Waiter called successfully"
  }
  ```
- **Response (200 OK - On duplicate active request):**
  Returns the existing active waiter call record instead of duplicating.
  ```json
  {
    "success": true,
    "data": { ... },
    "message": "An active waiter call already exists for this table"
  }
  ```

---

### 2. Lookup Table Active Waiter Call (Public, no auth)
Helper lookup endpoint to check if an active call is already open on load.
- **Method:** `GET`
- **Path:** `/api/v1/public/tables/:tableToken/waiter-call/active`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": { ... } // null if no open active call
  }
  ```

---

### 3. List Waiter Calls (Require Auth, requireRestaurantAccess check)
- **Method:** `GET`
- **Path:** `/api/v1/restaurants/:restaurantId/waiter-calls?page=1&limit=10&status=PENDING`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "waiterCalls": [ ... ],
      "pagination": {
        "page": 1,
        "limit": 10,
        "total": 1,
        "totalPages": 1
      }
    }
  }
  ```

---

### 4. Acknowledge Waiter Call (Require Auth, requireRestaurantAccess check)
- **Method:** `PATCH`
- **Path:** `/api/v1/restaurants/:restaurantId/waiter-calls/:callId/acknowledge`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": { "status": "ACKNOWLEDGED", "acknowledgedAt": "..." }
  }
  ```

---

### 5. Resolve Waiter Call (Require Auth, requireRestaurantAccess check)
- **Method:** `PATCH`
- **Path:** `/api/v1/restaurants/:restaurantId/waiter-calls/:callId/resolve`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": { "status": "RESOLVED", "resolvedAt": "..." }
  }
  ```

---

## 📦 Orders & Status Management Endpoints

### 1. Place a New Order (Public, no auth)
Submits a table's local cart items to place an order. Recomputes all base and add-on pricing strictly server-side.
- **Method:** `POST`
- **Path:** `/api/v1/public/restaurants/:restaurantSlug/tables/:tableToken/orders`
- **Request Body:**
  ```json
  {
    "items": [
      {
        "itemId": "60d0fe...",
        "quantity": 2,
        "selectedAddOns": [
          { "name": "Extra Mozzarella" }
        ],
        "specialInstructions": "No onions"
      }
    ],
    "customerNote": "Please bring hot sauce"
  }
  ```
- **Response (211 Created):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "60d0fe...",
      "restaurantId": "60d0fe...",
      "tableId": "60d0fe...",
      "orderNumber": 1,
      "items": [ ... ],
      "subtotal": 12000,
      "tax": 600,
      "total": 12600,
      "customerNote": "Please bring hot sauce",
      "status": "PENDING",
      "source": "QR"
    },
    "message": "Order placed successfully"
  }
  ```
- **Response (400 Bad Request - ITEMS_UNAVAILABLE):**
  ```json
  {
    "success": false,
    "error": {
      "code": "ITEMS_UNAVAILABLE",
      "message": "Some items in your basket are currently unavailable.",
      "details": [
        { "menuItemId": "60d0fe...", "name": "Margherita", "reason": "unavailable" }
      ]
    }
  }
  ```

---

### 2. Get Order Details (Public, no auth)
- **Method:** `GET`
- **Path:** `/api/v1/public/orders/:orderId`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": { ... },
    "message": "Order retrieved successfully"
  }
  ```

---

### 3. Get Order Status Only (Public, no auth, for cheap polling)
- **Method:** `GET`
- **Path:** `/api/v1/public/orders/:orderId/status`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": { "status": "PENDING" },
    "message": "Order status retrieved successfully"
  }
  ```

---

### 4. List Paginated Restaurant Orders (Require MANAGER/STAFF/SUPER_ADMIN, requireRestaurantAccess check)
- **Method:** `GET`
- **Path:** `/api/v1/restaurants/:restaurantId/orders?page=1&limit=10&status=PENDING`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "orders": [ ... ],
      "pagination": {
        "page": 1,
        "limit": 10,
        "total": 4,
        "totalPages": 1
      }
    },
    "message": "Orders retrieved successfully"
  }
  ```

---

### 5. List Active Restaurant Orders (Require MANAGER/STAFF/SUPER_ADMIN, requireRestaurantAccess check)
Returns all active queue tickets (everything not SERVED or CANCELLED) sorted by oldest first.
- **Method:** `GET`
- **Path:** `/api/v1/restaurants/:restaurantId/orders/active`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [ ... ],
    "message": "Active orders retrieved successfully"
  }
  ```

---

### 6. Update Order Status (Require MANAGER/STAFF/SUPER_ADMIN, requireRestaurantAccess check)
Progresses the order status. Must run through transition validation rules.
- **Method:** `PATCH`
- **Path:** `/api/v1/restaurants/:restaurantId/orders/:orderId/status`
- **Request Body:**
  ```json
  { "status": "ACCEPTED" }
  ```

---

### 7. Cancel Order (Require MANAGER/SUPER_ADMIN only, requireRestaurantAccess check)
Directly cancels an active order. Blocked for STAFF role.
- **Method:** `POST`
- **Path:** `/api/v1/restaurants/:restaurantId/orders/:orderId/cancel`

---

### 2. Get Public Menu
Returns active categories sorted by `sortOrder` with their associated menu items nested (including both available and unavailable ones).
- **Method:** `GET`
- **Path:** `/api/v1/public/restaurants/:restaurantSlug/tables/:tableToken/menu`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "_id": "60d0fe...",
        "name": "Sourdough Pizzas",
        "description": "Hand-stretched sourdough pizzas",
        "imageUrl": "https://res.cloudinary.com/...",
        "sortOrder": 0,
        "menuItems": [
          {
            "_id": "60d0fe...",
            "restaurantId": "60d0fe...",
            "categoryId": "60d0fe...",
            "name": "Margherita Sourdough",
            "description": "San Marzano tomatoes, fresh mozzarella, basil",
            "price": 49900,
            "imageUrl": "https://res.cloudinary.com/...",
            "isAvailable": true,
            "isVegetarian": true,
            "isSpicy": false,
            "prepTimeMinutes": 12,
            "sortOrder": 0,
            "addOns": [
              { "name": "Extra Mozzarella", "priceDelta": 6000 }
            ]
          }
        ]
      }
    ],
    "message": "Public menu retrieved successfully"
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

## 🍽️ Categories & Menu Management Endpoints (Require MANAGER/SUPER_ADMIN role + requireRestaurantAccess check)

### 1. List Categories
- **Method:** `GET`
- **Path:** `/api/v1/restaurants/:restaurantId/categories`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "_id": "60d0fe...",
        "restaurantId": "60d0fe...",
        "name": "Sourdough Pizzas",
        "description": "Hand-stretched sourdough pizzas",
        "sortOrder": 0,
        "isActive": true
      }
    ]
  }
  ```

---

### 2. Create Category
- **Method:** `POST`
- **Path:** `/api/v1/restaurants/:restaurantId/categories`
- **Request Body:**
  ```json
  {
    "name": "Sourdough Pizzas",
    "description": "Woodfired pizzas",
    "imageUrl": "https://res.cloudinary.com/..."
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": { ... }
  }
  ```

---

### 3. Delete Category
Blocks category deletion with a `409 Conflict` if the category has associated menu items.
- **Method:** `DELETE`
- **Path:** `/api/v1/restaurants/:restaurantId/categories/:categoryId`
- **Response (409 Conflict):**
  ```json
  {
    "success": false,
    "error": {
      "code": "CONFLICT",
      "message": "Cannot delete category. There are 5 menu items inside this category. Please delete or move them first.",
      "details": null
    }
  }
  ```

---

### 4. Reorder Categories
Accepts an ordered array of categoryIds to update sort orders in a single bulk operation.
- **Method:** `PATCH`
- **Path:** `/api/v1/restaurants/:restaurantId/categories-reorder`
- **Request Body:**
  ```json
  {
    "categoryIds": ["catId3", "catId1", "catId2"]
  }
  ```

---

### 5. Create Menu Item
- **Method:** `POST`
- **Path:** `/api/v1/restaurants/:restaurantId/menu-items`
- **Request Body:**
  ```json
  {
    "categoryId": "60d0fe...",
    "name": "Margherita Sourdough",
    "description": "San Marzano tomatoes, fresh mozzarella, basil",
    "price": 49900, // Stored as integer cents/paise (499.00 INR)
    "isVegetarian": true,
    "isSpicy": false,
    "prepTimeMinutes": 12,
    "addOns": [
      { "name": "Extra Mozzarella", "priceDelta": 6000 }
    ]
  }
  ```

---

### 6. Bulk Update Availability
- **Method:** `PATCH`
- **Path:** `/api/v1/restaurants/:restaurantId/menu-items-bulk-availability`
- **Request Body:**
  ```json
  {
    "itemIds": ["id1", "id2", "id3"],
    "isAvailable": false
  }
  ```

---

### 7. Fetch Upload Signature
Generates direct Cloudinary secure signed signature. `CLOUDINARY_API_SECRET` stays strictly server-side.
- **Method:** `POST`
- **Path:** `/api/v1/restaurants/:restaurantId/uploads/signature`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "signature": "8a38b18ca7e...",
      "timestamp": 1721494800,
      "folder": "pixora-qr/60d0fe.../menu",
      "apiKey": "123456789...",
      "cloudName": "your-cloud-name"
    }
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
