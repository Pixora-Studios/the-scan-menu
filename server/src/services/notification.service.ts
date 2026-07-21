import { SocketService } from '../sockets/socket.service';

export class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private getIO() {
    return SocketService.getInstance().getIO();
  }

  public notifyOrderCreated(restaurantId: string, orderSummary: any): void {
    try {
      this.getIO().to(`restaurant:${restaurantId}`).emit('order:created', orderSummary);
    } catch (err) {
      console.error('NotificationService notifyOrderCreated failed:', err);
    }
  }

  public notifyOrderStatusUpdated(restaurantId: string, orderId: string, status: string, updatedAt: Date): void {
    try {
      const payload = { orderId, status, updatedAt };
      this.getIO().to(`order:${orderId}`).emit('order:status_updated', payload);
      this.getIO().to(`restaurant:${restaurantId}`).emit('order:status_updated', payload);
    } catch (err) {
      console.error('NotificationService notifyOrderStatusUpdated failed:', err);
    }
  }

  public notifyWaiterCallCreated(restaurantId: string, waiterCall: any): void {
    try {
      this.getIO().to(`restaurant:${restaurantId}`).emit('waiter_call:created', waiterCall);
    } catch (err) {
      console.error('NotificationService notifyWaiterCallCreated failed:', err);
    }
  }

  public notifyWaiterCallResolved(restaurantId: string, callId: string, status: string, resolvedAt: Date): void {
    try {
      const payload = { callId, status, resolvedAt };
      this.getIO().to(`restaurant:${restaurantId}`).emit('waiter_call:resolved', payload);
    } catch (err) {
      console.error('NotificationService notifyWaiterCallResolved failed:', err);
    }
  }
}
export default NotificationService;
