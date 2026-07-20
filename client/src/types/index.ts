export interface User {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'MANAGER' | 'STAFF';
  isActive: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message: string;
  error?: {
    code: string;
    message: string;
    details: any;
  };
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isInitialized: boolean;
}
