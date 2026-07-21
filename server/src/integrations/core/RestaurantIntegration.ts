export interface RestaurantIntegration {
  syncMenu(restaurantId: string): Promise<any>;
  pushOrder(order: any): Promise<any>;
  updateOrderStatus(orderId: string, status: string): Promise<any>;
  syncOrder(orderId: string): Promise<any>;
}
