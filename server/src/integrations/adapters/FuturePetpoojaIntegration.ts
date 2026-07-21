import { RestaurantIntegration } from '../core/RestaurantIntegration';
import { NotImplementedError } from '../core/NotImplementedError';

export class FuturePetpoojaIntegration implements RestaurantIntegration {
  async syncMenu(_restaurantId: string): Promise<any> {
    throw new NotImplementedError('PETPOOJA', 'syncMenu');
  }

  async pushOrder(_order: any): Promise<any> {
    throw new NotImplementedError('PETPOOJA', 'pushOrder');
  }

  async updateOrderStatus(_orderId: string, _status: string): Promise<any> {
    throw new NotImplementedError('PETPOOJA', 'updateOrderStatus');
  }

  async syncOrder(_orderId: string): Promise<any> {
    throw new NotImplementedError('PETPOOJA', 'syncOrder');
  }
}
export default FuturePetpoojaIntegration;
