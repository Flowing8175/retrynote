import { useAuthStore } from '@/stores/authStore';
import type { UserProfile } from '@/types';

const makeUser = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: 'u1',
  username: 'testuser',
  email: 'test@example.com',
  role: 'student',
  is_active: true,
  storage_used_bytes: 0,
  storage_quota_bytes: 1_000_000,
  last_login_at: null,
  storage_deletion_deadline: null,
  ...overrides,
});

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  describe('initial state', () => {
    it('has null user', () => {
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('has null tokens', () => {
      const s = useAuthStore.getState();
      expect(s.accessToken).toBeNull();
      expect(s.refreshToken).toBeNull();
    });

    it('isAuthenticated is false', () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('isAdmin is false', () => {
      expect(useAuthStore.getState().isAdmin).toBe(false);
    });
  });

  describe('setUser', () => {
    it('sets user and isAuthenticated to true for regular user', () => {
      const user = makeUser();
      useAuthStore.getState().setUser(user);
      const s = useAuthStore.getState();
      expect(s.user).toEqual(user);
      expect(s.isAuthenticated).toBe(true);
      expect(s.isAdmin).toBe(false);
    });

    it('sets isAdmin true for admin role', () => {
      useAuthStore.getState().setUser(makeUser({ role: 'admin' }));
      expect(useAuthStore.getState().isAdmin).toBe(true);
    });

    it('sets isAdmin true for super_admin role', () => {
      useAuthStore.getState().setUser(makeUser({ role: 'super_admin' }));
      expect(useAuthStore.getState().isAdmin).toBe(true);
    });

    it('clears user and flags when set to null', () => {
      useAuthStore.getState().setUser(makeUser());
      useAuthStore.getState().setUser(null);
      const s = useAuthStore.getState();
      expect(s.user).toBeNull();
      expect(s.isAuthenticated).toBe(false);
      expect(s.isAdmin).toBe(false);
    });
  });

  describe('setTokens', () => {
    it('sets accessToken and refreshToken', () => {
      useAuthStore.getState().setTokens('at-123', 'rt-456');
      const s = useAuthStore.getState();
      expect(s.accessToken).toBe('at-123');
      expect(s.refreshToken).toBe('rt-456');
    });
  });

  describe('logout', () => {
    it('clears all state', () => {
      const store = useAuthStore.getState();
      store.setUser(makeUser({ role: 'admin' }));
      store.setTokens('at', 'rt');
      store.setImpersonation('uid', 'uname');
      store.setAdminToken('adm-token');

      useAuthStore.getState().logout();
      const s = useAuthStore.getState();
      expect(s.user).toBeNull();
      expect(s.accessToken).toBeNull();
      expect(s.refreshToken).toBeNull();
      expect(s.isAuthenticated).toBe(false);
      expect(s.isAdmin).toBe(false);
      expect(s.impersonatingUserId).toBeNull();
      expect(s.impersonatingUsername).toBeNull();
      expect(s.adminToken).toBeNull();
    });
  });

  describe('impersonation', () => {
    it('setImpersonation sets userId and username', () => {
      useAuthStore.getState().setImpersonation('u2', 'bob');
      const s = useAuthStore.getState();
      expect(s.impersonatingUserId).toBe('u2');
      expect(s.impersonatingUsername).toBe('bob');
    });

    it('endImpersonation clears only impersonation fields', () => {
      const store = useAuthStore.getState();
      store.setUser(makeUser());
      store.setImpersonation('u2', 'bob');

      useAuthStore.getState().endImpersonation();
      const s = useAuthStore.getState();
      expect(s.impersonatingUserId).toBeNull();
      expect(s.impersonatingUsername).toBeNull();
      expect(s.user).not.toBeNull();
      expect(s.isAuthenticated).toBe(true);
    });
  });

  describe('setAdminToken', () => {
    it('sets admin token', () => {
      useAuthStore.getState().setAdminToken('adm-tok');
      expect(useAuthStore.getState().adminToken).toBe('adm-tok');
    });

    it('clears admin token with null', () => {
      useAuthStore.getState().setAdminToken('adm-tok');
      useAuthStore.getState().setAdminToken(null);
      expect(useAuthStore.getState().adminToken).toBeNull();
    });
  });
});
