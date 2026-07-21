import apiClient from '../lib/api';

export interface RestaurantTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoUrl?: string;
  coverImageUrl?: string;
}

export interface Restaurant {
  _id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  coverImageUrl?: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  googleReviewUrl?: string;
  currency: string;
  timezone: string;
  theme: RestaurantTheme;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Table {
  _id: string;
  restaurantId: string;
  tableNumber: string;
  displayName: string;
  token: string;
  isActive: boolean;
  qrCodeUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddOn {
  name: string;
  priceDelta: number;
}

export interface MenuItem {
  _id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number; // in cents/paise
  imageUrl?: string;
  isAvailable: boolean;
  isVegetarian: boolean;
  isSpicy: boolean;
  prepTimeMinutes?: number;
  sortOrder: number;
  addOns?: AddOn[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicCategory {
  _id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  sortOrder: number;
  menuItems: MenuItem[];
}

export interface PublicResolutionResponse {
  restaurant: Restaurant;
  table: Table;
}

export const adminService = {
  async listRestaurants(page = 1, limit = 10) {
    const res = await apiClient.get(`/admin/restaurants?page=${page}&limit=${limit}`);
    return res.data;
  },

  async getRestaurant(id: string) {
    const res = await apiClient.get(`/admin/restaurants/${id}`);
    return res.data;
  },

  async createRestaurant(data: Partial<Restaurant>) {
    const res = await apiClient.post('/admin/restaurants', data);
    return res.data;
  },

  async editRestaurant(id: string, data: Partial<Restaurant>) {
    const res = await apiClient.patch(`/admin/restaurants/${id}`, data);
    return res.data;
  },

  async suspendRestaurant(id: string) {
    const res = await apiClient.patch(`/admin/restaurants/${id}/suspend`);
    return res.data;
  },

  async activateRestaurant(id: string) {
    const res = await apiClient.patch(`/admin/restaurants/${id}/activate`);
    return res.data;
  },

  async assignManager(restaurantId: string, managerData: { userId?: string; email?: string; name?: string; password?: string }) {
    const res = await apiClient.post(`/admin/restaurants/${restaurantId}/managers`, managerData);
    return res.data;
  },
};

export const managerService = {
  async getRestaurantProfile(restaurantId: string) {
    const res = await apiClient.get(`/restaurants/${restaurantId}`);
    return res.data;
  },

  async editRestaurantProfile(restaurantId: string, data: Partial<Restaurant>) {
    const res = await apiClient.patch(`/restaurants/${restaurantId}`, data);
    return res.data;
  },

  async listTables(restaurantId: string) {
    const res = await apiClient.get(`/restaurants/${restaurantId}/tables`);
    return res.data;
  },

  async createTable(restaurantId: string, data: { tableNumber: string; displayName: string }) {
    const res = await apiClient.post(`/restaurants/${restaurantId}/tables`, data);
    return res.data;
  },

  async editTable(restaurantId: string, tableId: string, data: Partial<Table>) {
    const res = await apiClient.patch(`/restaurants/${restaurantId}/tables/${tableId}`, data);
    return res.data;
  },

  async deleteTable(restaurantId: string, tableId: string) {
    const res = await apiClient.delete(`/restaurants/${restaurantId}/tables/${tableId}`);
    return res.data;
  },

  async activateTable(restaurantId: string, tableId: string) {
    const res = await apiClient.patch(`/restaurants/${restaurantId}/tables/${tableId}/activate`);
    return res.data;
  },

  async deactivateTable(restaurantId: string, tableId: string) {
    const res = await apiClient.patch(`/restaurants/${restaurantId}/tables/${tableId}/deactivate`);
    return res.data;
  },

  async regenerateTableQr(restaurantId: string, tableId: string) {
    const res = await apiClient.post(`/restaurants/${restaurantId}/tables/${tableId}/regenerate-qr`);
    return res.data;
  },

  async getTableQr(restaurantId: string, tableId: string) {
    const res = await apiClient.get(`/restaurants/${restaurantId}/tables/${tableId}/qr`);
    return res.data;
  },
};

export const publicService = {
  async resolveTable(restaurantSlug: string, tableToken: string) {
    const res = await apiClient.get(`/public/restaurants/${restaurantSlug}/tables/${tableToken}`);
    return res.data;
  },

  async getPublicMenu(restaurantSlug: string, tableToken: string) {
    const res = await apiClient.get(`/public/restaurants/${restaurantSlug}/tables/${tableToken}/menu`);
    return res.data;
  },
};
