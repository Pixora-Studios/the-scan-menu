# Pixora QR Platform — Third-Party POS Integration Architecture Seam

This document specifies the decoupled integration adapter seam designed in Phase 12. It details how Pixora interfaces with third-party Point of Sale (POS) and merchant APIs (such as Petpooja, Rista, and UrbanPiper) without fragmenting core Express controllers.

---

## 🏗️ The Adapter Seam Pattern

To maintain a standalone core while preparing for subsequent enterprise SaaS white-label POS connections, the platform employs an **Adapter Seam Pattern** centered around:
1. A unified, provider-agnostic interface (`RestaurantIntegration`).
2. An **Integration Factory** (`IntegrationFactory`) that resolves active adapters dynamically based on each restaurant's `integrationConfig` in MongoDB.
3. An **Asynchronous Side-Effect Lifecycle** that executes pushes in non-blocking threads during public checkouts.
4. Robust audit logging (`IntegrationSyncLog`) tracking sync state histories and stack diagnostics.

---

## 🔌 The `RestaurantIntegration` Interface

Defined under `server/src/integrations/core/RestaurantIntegration.ts`, this contract encapsulates all possible sync actions:

```typescript
export interface RestaurantIntegration {
  /**
   * Syncs the restaurant's category/menu items schema to the remote POS.
   */
  syncMenu(restaurantId: string): Promise<any>;

  /**
   * Pushes a newly placed customer order directly to the merchant's kitchen screen.
   */
  pushOrder(order: any): Promise<any>;

  /**
   * Updates status changes (e.g. ACCEPTED -> PREPARING -> READY -> SERVED) remotely.
   */
  updateOrderStatus(orderId: string, status: string): Promise<any>;

  /**
   * Manual fallback query to reconcile status anomalies.
   */
  syncOrder(orderId: string): Promise<any>;
}
```

---

## ⚙️ Configured Adapters

Adapters are placed under `server/src/integrations/adapters/`:

### 1. `NoOpIntegration` (Active by Default)
Supplies a clean, dependency-free mock loop. Logs calls server-side via `pino` and resolves instantly with success payloads. No third-party network trips are made.

### 2. Stub Enterprise Adapters
Stubs are designed for upcoming white-label integrations and throw a secure `NotImplementedError` if invoked:
- `FuturePetpoojaIntegration`
- `FutureRistaIntegration`
- `FutureUrbanPiperIntegration`

---

## 🗄️ Mongoose `IntegrationSyncLog` Model

Every transaction creates a log document inside `integration_sync_logs` collection, tracking sync lifetimes:

- **States:** `'ORDER_SYNC_PENDING' ➔ 'ORDER_SYNCED' | 'ORDER_SYNC_FAILED'`
- **Schema:**
  ```typescript
  {
    restaurantId: Schema.Types.ObjectId, // Tenant reference
    orderId: Schema.Types.ObjectId,      // Associated order ticket
    provider: String,                    // e.g., 'NONE', 'PETPOOJA'
    status: String,                      // Sync status enum
    syncAttempts: Number,                // Incremented retry counter
    errorLog: String,                    // Masked error message on failure
  }
  ```

---

## 🚀 How to Extend the Seam

To wire a new live merchant POS integration (e.g. Petpooja):
1. Create `PetpoojaIntegration.ts` inside `server/src/integrations/adapters/` implementing `RestaurantIntegration`.
2. Map your custom REST endpoints (e.g. push order endpoints) inside `pushOrder` using Axios.
3. Open `server/src/integrations/core/IntegrationFactory.ts` and update the resolver map:
   ```typescript
   case 'PETPOOJA':
     return new PetpoojaIntegration();
   ```
4. Set `restaurant.integrationConfig.provider = 'PETPOOJA'` on target tenants to activate!
