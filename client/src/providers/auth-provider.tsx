import { createContext, useContext, useEffect, useState } from 'react';
import { pb } from '@/lib/pb';
import type { UserRecord } from '@/lib/types';

interface AuthContextValue {
  user: UserRecord | null;
  loginWithPassword: (identity: string, password: string) => Promise<UserRecord>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserRecord | null>((pb.authStore.record as UserRecord | null) ?? null);

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange(() => {
      setUser((pb.authStore.record as UserRecord | null) ?? null);
    });
    return () => unsubscribe();
  }, []);

  const value: AuthContextValue = {
    user,
    loginWithPassword: async (identity, password) => {
      const result = await pb.collection<UserRecord>('users').authWithPassword(identity, password);
      return result.record;
    },
    logout: () => pb.authStore.clear(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return ctx;
}

export function useUser() {
  const { user } = useAuth();

  if (!user) {
    throw new Error('useUser must be used within an AuthProvider and when a user is logged in');
  }

  return user;
}
