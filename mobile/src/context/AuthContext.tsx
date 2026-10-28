import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { TokenStorage } from '../storage/token-storage';
import { AuthApi, UserProfile, AuthTokensResponse } from '../api/auth';
import { setAuthFailureCallback } from '../api/client';
import { useToast } from './ToastContext';

export const STAFF_ROLES = [
  'HOA_ADMIN',
  'HOA_CHAIRMAN',
  'DISPATCHER',
  'SECURITY',
] as const;

export type StaffRole = typeof STAFF_ROLES[number];

export function isStaffUser(role?: string | null): boolean {
  if (!role) return false;
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function canAccessChat(role?: string | null): boolean {
  return role === 'DISPATCHER' || role === 'HOA_ADMIN';
}

export function canAccessRequests(role?: string | null): boolean {
  return role === 'DISPATCHER' || role === 'HOA_ADMIN' || role === 'HOA_CHAIRMAN';
}

export function canManageRequests(role?: string | null): boolean {
  return role === 'DISPATCHER' || role === 'HOA_ADMIN';
}

export function canAccessLogs(role?: string | null): boolean {
  return role === 'SECURITY' || role === 'HOA_ADMIN';
}

export function canManageSos(role?: string | null): boolean {
  return role === 'SECURITY' || role === 'DISPATCHER' || role === 'HOA_ADMIN';
}

export function canAccessShiftHandover(role?: string | null): boolean {
  return role === 'SECURITY' || role === 'DISPATCHER' || role === 'HOA_ADMIN';
}

function normalizeProfile(raw: UserProfile): UserProfile {
  if (!raw) return raw;
  const flatTenantName = raw.tenantName || (raw as any)?.tenant_name;
  if (!raw.tenant && flatTenantName) {
    return {
      ...raw,
      tenant: {
        id: raw.tenantId || '',
        name: flatTenantName,
        address: (raw as any)?.tenantAddress || '',
        city: (raw as any)?.tenantCity || '',
      },
    };
  }
  return raw;
}

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasOwnership: boolean;
  isStaffRole: boolean;
  activeTenantId: string | null;
  login: (authData: AuthTokensResponse) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hideDevCodeToast } = useToast();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const handleAuthFailure = useCallback(() => {
    setUser(null);
    TokenStorage.clearTokens();
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await AuthApi.getMe();
      setUser((prev) => normalizeProfile({ ...(prev || {}), ...profile }));
    } catch {
      handleAuthFailure();
    }
  }, [handleAuthFailure]);

  useEffect(() => {
    setAuthFailureCallback(handleAuthFailure);

    async function initAuth() {
      try {
        const token = await TokenStorage.getAccessToken();
        if (token) {
          const profile = await AuthApi.getMe();
          setUser(normalizeProfile(profile));
        }
      } catch (err) {
        console.log('Session expired or invalid, logging out:', err);
        await TokenStorage.clearTokens();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, [handleAuthFailure]);

  const login = async (authData: AuthTokensResponse) => {
    hideDevCodeToast();
    await TokenStorage.saveTokens(authData.accessToken, authData.refreshToken);
    const initialUser = normalizeProfile(authData.user);
    setUser(initialUser);

    // Fetch full profile (e.g. for staff where verify-otp response doesn't include full tenant object)
    try {
      const fullProfile = await AuthApi.getMe();
      setUser((prev) => {
        const merged = normalizeProfile({
          ...(prev || initialUser),
          ...fullProfile,
        });
        return merged;
      });
    } catch (err) {
      console.warn('Failed to load full profile after login:', err);
    }
  };

  const logout = async () => {
    try {
      await AuthApi.logout();
    } catch {
      // Ignore network error on logout
    } finally {
      await TokenStorage.clearTokens();
      setUser(null);
    }
  };

  const isStaffRole = Boolean(user && isStaffUser(user.role));
  const hasOwnership = Boolean(user && user.ownerships && user.ownerships.length > 0);
  const activeTenantId = user?.tenantId || user?.tenant?.id || (user?.ownerships && user.ownerships[0]?.unit ? (user as any).tenantId : null) || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        hasOwnership,
        isStaffRole,
        activeTenantId,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
