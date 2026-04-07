import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserProfile } from '@/types';
import type { UsageStatus } from '../types/billing';

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  impersonatingUserId: string | null;
  impersonatingUsername: string | null;
  impersonationId: string | null;
  adminToken: string | null;
  setUser: (user: UserProfile | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setImpersonation: (userId: string, username: string, impersonationId: string) => void;
  endImpersonation: () => void;
  setAdminToken: (token: string | null) => void;
  usageStatus: UsageStatus | null;
  setUsageStatus: (status: UsageStatus | null) => void;
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
      impersonationId: null,
      adminToken: null,
      usageStatus: null,

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
        impersonationId: null,
        adminToken: null,
        usageStatus: null,
      }),

      setImpersonation: (userId, username, impersonationId) => set({
        impersonatingUserId: userId,
        impersonatingUsername: username,
        impersonationId,
      }),

      endImpersonation: () => set({
        impersonatingUserId: null,
        impersonatingUsername: null,
        impersonationId: null,
        adminToken: null,       // H-009: clear admin token when impersonation ends
      }),

      setAdminToken: (adminToken) => set({ adminToken }),

      setUsageStatus: (status) => set({ usageStatus: status }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
      // M-007: adminToken is NOT persisted — memory-only for security
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        isAdmin: state.isAdmin,
        impersonatingUserId: state.impersonatingUserId,
        impersonatingUsername: state.impersonatingUsername,
        impersonationId: state.impersonationId,
        usageStatus: state.usageStatus,
        // adminToken intentionally excluded
      }),
    }
  )
);
