import { RestaurantIntegration } from '../core/RestaurantIntegration';
import { NotImplementedError } from '../core/NotImplementedError';

export class FutureRistaIntegration implements RestaurantIntegration {
  async syncMenu(_restaurantId: string): Promise<any> {
    throw new NotImplementedError('RISTA', 'syncMenu');
  }

  async pushOrder(_order: any): Promise<any> {
    throw new NotImplementedError('RISTA', 'pushOrder');
  }

  async updateOrderStatus(_orderId: string, _status: string): Promise<any> {
    throw new NotImplementedError('RISTA', 'updateOrderStatus');
  }

  async syncOrder(_orderId: string): Promise<any> {
    throw new NotImplementedError('RISTA', 'syncOrder');
  }
}
export default FutureRistaIntegration;
