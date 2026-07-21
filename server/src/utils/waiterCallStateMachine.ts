import { WaiterCallStatus } from '../models/WaiterCall';

export const ALLOWED_WAITER_CALL_TRANSITIONS: Record<WaiterCallStatus, WaiterCallStatus[]> = {
  PENDING: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['RESOLVED', 'CANCELLED'],
  RESOLVED: [],
  CANCELLED: [],
};

export interface WaiterCallTransitionResult {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Validates whether a waiter call can transition from its current status to a next status.
 * Both STAFF and MANAGER can perform these transitions, but they must follow correct progression.
 */
export function validateWaiterCallTransition(
  currentStatus: WaiterCallStatus,
  nextStatus: WaiterCallStatus
): WaiterCallTransitionResult {
  // If nextStatus is exactly currentStatus, it's valid (noop)
  if (currentStatus === nextStatus) {
    return { isValid: true };
  }

  const allowedNext = ALLOWED_WAITER_CALL_TRANSITIONS[currentStatus];
  if (!allowedNext || !allowedNext.includes(nextStatus)) {
    return {
      isValid: false,
      errorCode: 'INVALID_STATUS_TRANSITION',
      errorMessage: `Invalid waiter call transition from state ${currentStatus} to ${nextStatus}.`,
    };
  }

  return { isValid: true };
}
export default validateWaiterCallTransition;
