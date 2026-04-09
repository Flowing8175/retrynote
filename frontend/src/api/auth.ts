import apiClient from './client';
import { useAuthStore } from '@/stores/authStore';
import type {
  SignupRequest,
  SignupResponse,
  LoginRequest,
  LoginResponse,
  PasswordResetRequest,
  PasswordResetConfirm,
  RefreshTokenRequest,
  UserProfile,
  DeleteAccountRequest,
} from '@/types';

export const authApi = {
  signup: async (data: SignupRequest): Promise<SignupResponse> => {
    const response = await apiClient.post<SignupResponse>('/auth/signup', data);
    return response.data;
  },

  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/login', data);
    return response.data;
  },

  logout: async (): Promise<void> => {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (refreshToken) {
      await apiClient.post('/auth/logout', { refresh_token: refreshToken });
    }
  },

  passwordResetRequest: async (data: PasswordResetRequest): Promise<{ status: string; detail?: string }> => {
    const response = await apiClient.post<{ status: string; detail?: string }>('/auth/password/reset/request', data);
    return response.data;
  },

  passwordResetConfirm: async (data: PasswordResetConfirm): Promise<{ status: string }> => {
    const response = await apiClient.post<{ status: string }>('/auth/password/reset/confirm', data);
    return response.data;
  },

  refreshToken: async (data: RefreshTokenRequest): Promise<{ access_token: string; refresh_token: string; token_type: string }> => {
    const response = await apiClient.post<{ access_token: string; refresh_token: string; token_type: string }>('/auth/refresh', data);
    return response.data;
  },

  getMe: async (): Promise<UserProfile> => {
    const response = await apiClient.get<UserProfile>('/auth/me');
    return response.data;
  },

  deleteAccount: async (data: DeleteAccountRequest): Promise<{ status: string }> => {
    const response = await apiClient.delete<{ status: string }>('/auth/me', { data });
    return response.data;
  },

  verifyEmail: async (token: string): Promise<{ status: string }> => {
    const response = await apiClient.post<{ status: string }>('/auth/verify-email', { token });
    return response.data;
  },

  resendVerification: async (email: string): Promise<{ status: string }> => {
    const response = await apiClient.post<{ status: string }>('/auth/resend-verification', { email });
    return response.data;
  },

  convertGuest: async (data: {
    username: string;
    email: string;
    password: string;
    guest_session_id: string;
    turnstile_token: string;
  }): Promise<{ user: UserProfile; access_token: string; refresh_token: string }> => {
    const response = await apiClient.post<{ user: UserProfile; access_token: string; refresh_token: string }>(
      '/auth/convert-guest',
      data
    );
    return response.data;
  },
};
