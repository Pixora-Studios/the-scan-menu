# WEBSOCKETS.md - WebSocket Real-Time Specification

This document details the Socket.IO setup, handshake authentication, rooms, and real-time event definitions used across the Pixora QR platform.

---

## 🔌 Connection Setup

- **Server URL:** `http://localhost:5000` (or root server domain)
- **Namespace:** Main namespace (`/`)
- **Transport:** WebSocket fallback to polling

---

## 🔒 Handshake Authentication Model

To connect to room scopes that belong to restaurant properties, clients must authenticate over the socket during connection.

### Modern auth Handshake Handlers (Staff/Manager/Super Admin)
Staff clients connect passing their JWT access token in the `auth` handshake dictionary:

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: `Bearer ${localStorage.getItem('accessToken')}`
  }
});
```

The server decodes the JWT and validates that the user is an active staff record belonging to the restaurant they are attempting to subscribe to. If unauthenticated, the server will emit an `error` event and reject the action.

### Anonymous public Access Handlers (Customers)
Customers looking up order status do **not** need to authenticate over the socket connection. The unguessable MongoDB ObjectId of the placed `orderId` acts as their credential for room entry.

---

## 🏠 Web Real-Time Rooms

### 1. `restaurant:{restaurantId}`
- **Who Joins:** Authenticated staff, managers, and super admins.
- **How to Join:** Emit `join_restaurant` event with `{ restaurantId }`. Must pass valid JWT.
- **Purpose:** Receives live incoming order tickets and status changes.

### 2. `order:{orderId}`
- **Who Joins:** Anonymous public customer watching their order summary/receipt.
- **How to Join:** Emit `join_order` event with `{ orderId }`.
- **Purpose:** Receives live state updates from kitchen preparation stages.

---

## 📣 Event Definitions & Payload Shapes

### Client to Server Actions

#### 1. `join_order`
Customer browser subscribes to live updates of their placed order.
- **Payload:**
  ```json
  { "orderId": "6640f0..." }
  ```

#### 2. `join_restaurant`
Staff connects and joins their restaurant workspace.
- **Payload:**
  ```json
  { "restaurantId": "6640f0..." }
  ```

---

### Server to Client Events

#### 1. `order:created`
Fired when a customer submits their cart and places an order. Sent to room `restaurant:{restaurantId}`.
- **Payload:**
  ```json
  {
    "_id": "6640f0...",
    "restaurantId": "6640f1...",
    "tableId": {
      "_id": "6640f2...",
      "displayName": "Table 15 (Terrace)",
      "tableNumber": "15"
    },
    "orderNumber": 2,
    "items": [
      {
        "menuItemId": "6640f3...",
        "nameSnapshot": "Margherita Sourdough",
        "unitPriceSnapshot": 55900,
        "quantity": 1,
        "selectedAddOns": [],
        "specialInstructions": ""
      }
    ],
    "subtotal": 55900,
    "tax": 6708,
    "total": 62608,
    "customerNote": "Please make it extra crispy",
    "status": "PENDING",
    "source": "QR",
    "createdAt": "2026-07-21T08:50:40.000Z"
  }
  ```

#### 2. `order:status_updated`
Fired when staff advances or cancels an order. Sent to both `order:{orderId}` and `restaurant:{restaurantId}` rooms.
- **Payload:**
  ```json
  {
    "orderId": "6640f0...",
    "status": "ACCEPTED",
    "updatedAt": "2026-07-21T08:52:12.000Z"
  }
  ```

#### 3. `waiter_call:created`
Fired when a customer requests floor service assistance. Sent to room `restaurant:{restaurantId}`.
- **Payload:**
  ```json
  {
    "_id": "6640f0...",
    "restaurantId": "6640f1...",
    "tableId": "6640f2...",
    "tableNumberSnapshot": "15",
    "status": "PENDING",
    "createdAt": "2026-07-21T09:30:10.000Z"
  }
  ```

#### 4. `waiter_call:resolved`
Fired when staff acknowledges or resolves a waiter call. Sent to room `restaurant:{restaurantId}`.
- **Payload:**
  ```json
  {
    "callId": "6640f0...",
    "status": "RESOLVED",
    "resolvedAt": "2026-07-21T09:32:00.000Z"
  }
  ```

#### 5. `error`
Generic error event emitted to the specific socket on failed validation.
- **Payload:**
  ```json
  {
    "code": "UNAUTHORIZED" | "FORBIDDEN" | "INVALID_ORDER_ID" | "INVALID_RESTAURANT_ID",
    "message": "User friendly error message description"
  }
  ```
