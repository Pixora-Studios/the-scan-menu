import { RestaurantIntegration } from '../core/RestaurantIntegration';
import { NotImplementedError } from '../core/NotImplementedError';

export class FutureUrbanPiperIntegration implements RestaurantIntegration {
  async syncMenu(_restaurantId: string): Promise<any> {
    throw new NotImplementedError('URBANPIPER', 'syncMenu');
  }

  async pushOrder(_order: any): Promise<any> {
    throw new NotImplementedError('URBANPIPER', 'pushOrder');
  }

  async updateOrderStatus(_orderId: string, _status: string): Promise<any> {
    throw new NotImplementedError('URBANPIPER', 'updateOrderStatus');
  }

  async syncOrder(_orderId: string): Promise<any> {
    throw new NotImplementedError('URBANPIPER', 'syncOrder');
  }
}
export default FutureUrbanPiperIntegration;
