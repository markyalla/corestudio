import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { clearToken, getToken, login as apiLogin, logoutAllDevices } from "./api";

interface AuthState {
  isReady: boolean;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    getToken().then((token) => {
      setIsLoggedIn(!!token);
      setIsReady(true);
    });
  }, []);

  const value: AuthState = {
    isReady,
    isLoggedIn,
    async login(email, password) {
      await apiLogin(email, password);
      setIsLoggedIn(true);
    },
    async logout() {
      await clearToken();
      setIsLoggedIn(false);
    },
    async logoutAll() {
      try {
        await logoutAllDevices();
      } finally {
        // The call above just invalidated this device's own token too, so
        // clear it locally regardless of whether the request itself succeeded.
        await clearToken();
        setIsLoggedIn(false);
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
