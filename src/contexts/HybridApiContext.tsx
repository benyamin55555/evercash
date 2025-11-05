import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { initHybridAPI, type HybridAPI } from '@/lib/hybrid-api';
import { toast } from 'sonner';

interface ApiContextType {
  api: HybridAPI | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (password: string) => Promise<void>;
  logout: () => void;
  retryConnection: () => Promise<void>;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

export function ApiProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<HybridAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const apiRef = useRef<HybridAPI | null>(null);
  const isAuthRef = useRef(false);
  useEffect(() => { apiRef.current = api; }, [api]);
  useEffect(() => { isAuthRef.current = isAuthenticated; }, [isAuthenticated]);

  const initializingRef = useRef(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const initialize = useCallback(async () => {
    if (initializingRef.current) {
      // A run is already in progress; return the same promise if available
      if (initPromiseRef.current) return initPromiseRef.current;
      return;
    }
    initializingRef.current = true;
    const run = (async () => {
      try {
        setLoading(true);
        const baseUrl = import.meta.env.DEV
          ? '/api'
          : (import.meta.env.VITE_API_BASE_URL || 'https://api.evercash.in');
        
        // Avoid re-creating if already set
        let apiInstance = apiRef.current;
        if (!apiInstance) {
          console.log('🔄 Initializing Hybrid API (Actual Budget + Supabase):', baseUrl);
          apiInstance = await initHybridAPI(baseUrl);
          setApi(apiInstance);
          apiRef.current = apiInstance;
        }

        // Authenticate only if a real JWT exists AND an authenticated call succeeds
        try {
          const token = localStorage.getItem('actual-token');
          const isJwt = !!token && /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token);
          if (isJwt && !isAuthRef.current) {
            // Authenticated endpoint (requires valid JWT). If already authenticated, skip.
            await apiInstance.getAccounts();
            setIsAuthenticated(true);
            isAuthRef.current = true;
            console.log('✅ Authenticated with hybrid API using JWT');
          } else {
            setIsAuthenticated(false);
          }
        } catch (err) {
          console.warn('❌ Authentication check failed, user needs to login', err);
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error('💥 Failed to initialize Hybrid API:', err);
        toast.error('Failed to connect to server. Please check if the server is running.');
      } finally {
        setLoading(false);
        initializingRef.current = false;
        initPromiseRef.current = null;
      }
    })();
    initPromiseRef.current = run;
    return run;
  }, []);

  const login = async (password: string) => {
    if (!api) {
      throw new Error('API not initialized');
    }

    try {
      console.log('🔐 Attempting login with hybrid API...');
      
      // For demo purposes, accept any password and create a demo token
      const demoToken = 'demo-token-' + Date.now();
      localStorage.setItem('actual-token', demoToken);
      
      setIsAuthenticated(true);
      console.log('✅ Login successful with hybrid API (demo mode)');
      toast.success('🎉 Login successful! Using Actual Budget functions with Supabase storage.');
    } catch (error) {
      console.error('❌ Login failed:', error);
      setIsAuthenticated(false);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('actual-token');
    setIsAuthenticated(false);
    console.log('👋 User logged out from hybrid API');
    toast.info('Logged out');
  };

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <ApiContext.Provider value={{
      api,
      loading,
      isAuthenticated,
      login,
      logout,
      retryConnection: initialize,
    }}>
      {children}
    </ApiContext.Provider>
  );
}

export function useApi() {
  const context = useContext(ApiContext);
  if (context === undefined) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return context;
}
