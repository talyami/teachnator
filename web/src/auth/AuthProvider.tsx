import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, ClientError } from '../api/client';
import { UserProfile } from '@fast-learning/shared';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  showAuthModal: boolean;
  authModalMessage: string;
  setShowAuthModal: (show: boolean) => void;
  openAuthModal: (message?: string) => void;
  closeAuthModal: () => void;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithApple: (idToken: string, name?: string) => Promise<void>;
  linkGoogle: (idToken: string) => Promise<void>;
  linkApple: (idToken: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState('');

  const fetchProfile = async () => {
    try {
      const profile = await api.get<UserProfile>('/me');
      setUser(profile);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Check if a dev_token was provided in the query string (for seamless dev testing)
    const urlParams = new URLSearchParams(window.location.search);
    const devToken = urlParams.get('dev_token');
    if (devToken) {
      // Store in memory or header or trigger quick check
      document.cookie = `fl_session=${devToken}; path=/; max-age=2592000`;
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    fetchProfile();
  }, []);

  const openAuthModal = (message?: string) => {
    setAuthModalMessage(message || 'سجل الدخول لحفظ موادك واختباراتك والحصول على رصيد ذكاء اصطناعي يومي مجاني');
    setShowAuthModal(true);
  };

  const closeAuthModal = () => {
    setShowAuthModal(false);
    setAuthModalMessage('');
  };

  const loginWithGoogle = async (idToken: string) => {
    const res = await api.post<{ success: boolean; user: UserProfile }>('/auth/google', { idToken });
    setUser(res.user);
    closeAuthModal();
  };

  const loginWithApple = async (idToken: string, name?: string) => {
    const res = await api.post<{ success: boolean; user: UserProfile }>('/auth/apple', { idToken, name });
    setUser(res.user);
    closeAuthModal();
  };

  const linkGoogle = async (idToken: string) => {
    const res = await api.post<{ success: boolean; user: UserProfile }>('/auth/link/google', { idToken });
    setUser(res.user);
  };

  const linkApple = async (idToken: string, name?: string) => {
    const res = await api.post<{ success: boolean; user: UserProfile }>('/auth/link/apple', { idToken, name });
    setUser(res.user);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        showAuthModal,
        authModalMessage,
        setShowAuthModal,
        openAuthModal,
        closeAuthModal,
        loginWithGoogle,
        loginWithApple,
        linkGoogle,
        linkApple,
        logout,
        refetchUser: fetchProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
