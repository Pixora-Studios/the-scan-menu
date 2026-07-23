import { OrderStatus } from '../models/Order';

export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['SERVED'],
  SERVED: [],
  CANCELLED: [],
};

export interface TransitionResult {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Computes the aggregate rollup status of an order based on item-level status and ticket acceptance.
 */
export function computeOrderStatus(
  items: { itemStatus: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' }[],
  ticketAccepted: boolean,
  isCancelled: boolean = false
): OrderStatus {
  if (isCancelled) {
    return 'CANCELLED';
  }

  if (!items || items.length === 0) {
    return ticketAccepted ? 'ACCEPTED' : 'PENDING';
  }

  const allServed = items.every((item) => item.itemStatus === 'SERVED');
  if (allServed) {
    return 'SERVED';
  }

  const allAtLeastReady = items.every(
    (item) => item.itemStatus === 'READY' || item.itemStatus === 'SERVED'
  );
  if (allAtLeastReady) {
    return 'READY';
  }

  const anyPreparingOrReady = items.some(
    (item) => item.itemStatus === 'PREPARING' || item.itemStatus === 'READY'
  );
  if (anyPreparingOrReady) {
    return 'PREPARING';
  }

  return ticketAccepted ? 'ACCEPTED' : 'PENDING';
}

/**
 * Convenience helper to calculate order status from an Order document.
 */
export function getOrderStatusRollup(order: { status: OrderStatus; items: { itemStatus: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' }[] }): OrderStatus {
  const isCancelled = order.status === 'CANCELLED';
  const ticketAccepted = order.status !== 'PENDING' && order.status !== 'CANCELLED';
  return computeOrderStatus(order.items, ticketAccepted, isCancelled);
}

/**
 * Validates whether an order can transition from its current status to a next status,
 * taking into account the user's role permissions (e.g. STAFF vs MANAGER).
 */
export function validateStatusTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus,
  userRole: 'SUPER_ADMIN' | 'MANAGER' | 'STAFF'
): TransitionResult {
  // 1. If nextStatus is exactly currentStatus, it's valid (noop)
  if (currentStatus === nextStatus) {
    return { isValid: true };
  }

  // 2. Look up the valid next statuses from transition table
  const allowedNext = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowedNext || !allowedNext.includes(nextStatus)) {
    return {
      isValid: false,
      errorCode: 'INVALID_STATUS_TRANSITION',
      errorMessage: `Invalid transition from state ${currentStatus} to ${nextStatus}.`,
    };
  }

  // 3. Role-based check: Only MANAGER and SUPER_ADMIN can transition to CANCELLED
  if (nextStatus === 'CANCELLED') {
    if (userRole !== 'MANAGER' && userRole !== 'SUPER_ADMIN') {
      return {
        isValid: false,
        errorCode: 'FORBIDDEN',
        errorMessage: 'Only managers and super admins have permissions to cancel orders.',
      };
    }
  }

  return { isValid: true };
}
