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
