import { RestaurantIntegration } from './RestaurantIntegration';
import { NoOpIntegration } from '../adapters/NoOpIntegration';
import { FuturePetpoojaIntegration } from '../adapters/FuturePetpoojaIntegration';
import { FutureRistaIntegration } from '../adapters/FutureRistaIntegration';
import { FutureUrbanPiperIntegration } from '../adapters/FutureUrbanPiperIntegration';

export class IntegrationFactory {
  public static getAdapter(providerName?: string): RestaurantIntegration {
    const name = (providerName || '').toUpperCase().trim();
    switch (name) {
      case 'PETPOOJA':
        return new FuturePetpoojaIntegration();
      case 'RISTA':
        return new FutureRistaIntegration();
      case 'URBANPIPER':
        return new FutureUrbanPiperIntegration();
      case 'NONE':
      default:
        return new NoOpIntegration();
    }
  }
}
export default IntegrationFactory;
