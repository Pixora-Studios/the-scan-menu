import { RestaurantIntegration } from '../core/RestaurantIntegration';
import { logger } from '../../utils/logger';

export class NoOpIntegration implements RestaurantIntegration {
  async syncMenu(restaurantId: string): Promise<any> {
    logger.info(`NoOpIntegration.syncMenu called for restaurant: ${restaurantId}`);
    return { success: true, message: 'NoOp menu sync bypassed' };
  }

  async pushOrder(order: any): Promise<any> {
    logger.info(`NoOpIntegration.pushOrder called for order: ${order._id || order.orderNumber}`);
    return { success: true, message: 'NoOp order push bypassed' };
  }

  async updateOrderStatus(orderId: string, status: string): Promise<any> {
    logger.info(`NoOpIntegration.updateOrderStatus called for order: ${orderId} status: ${status}`);
    return { success: true, message: 'NoOp status update bypassed' };
  }

  async syncOrder(orderId: string): Promise<any> {
    logger.info(`NoOpIntegration.syncOrder called for order: ${orderId}`);
    return { success: true, message: 'NoOp order sync bypassed' };
  }
}
export default NoOpIntegration;
