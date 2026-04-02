import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile } from '@/types';

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  impersonatingUserId: string | null;
  impersonatingUsername: string | null;
  adminToken: string | null;
  setUser: (user: UserProfile | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setImpersonation: (userId: string, username: string) => void;
  endImpersonation: () => void;
  setAdminToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isAdmin: false,
      impersonatingUserId: null,
      impersonatingUsername: null,
      adminToken: null,

      setUser: (user) => set({ user, isAuthenticated: !!user, isAdmin: user?.role === 'admin' || user?.role === 'super_admin' }),

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

      logout: () => set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isAdmin: false,
        impersonatingUserId: null,
        impersonatingUsername: null,
        adminToken: null,
      }),

      setImpersonation: (userId, username) => set({
        impersonatingUserId: userId,
        impersonatingUsername: username,
      }),

      endImpersonation: () => set({
        impersonatingUserId: null,
        impersonatingUsername: null,
      }),

      setAdminToken: (adminToken) => set({ adminToken }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
