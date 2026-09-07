import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { TokenStorage } from '../storage/token-storage';
import { AuthApi, UserProfile, AuthTokensResponse } from '../api/auth';
import { setAuthFailureCallback } from '../api/client';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasOwnership: boolean;
  activeTenantId: string | null;
  login: (authData: AuthTokensResponse) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const handleAuthFailure = useCallback(() => {
    setUser(null);
    TokenStorage.clearTokens();
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await AuthApi.getMe();
      setUser(profile);
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
          setUser(profile);
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
    await TokenStorage.saveTokens(authData.accessToken, authData.refreshToken);
    setUser(authData.user);
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

  const hasOwnership = Boolean(user && user.ownerships && user.ownerships.length > 0);
  const activeTenantId = user?.tenantId || (user?.ownerships && user.ownerships[0]?.unit ? (user as any).tenantId : null) || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        hasOwnership,
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
