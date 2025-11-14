import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { initHybridAPI, type HybridAPI } from '@/lib/hybrid-api';
import { isDemoOverlayEnabled, createDemoOverlayAPI } from '@/lib/demo-overlay';
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
  const DEBUG = (import.meta as any)?.env?.VITE_DEBUG_LOGS === 'true';

  // refs to avoid stale closures and duplicate inits
  const apiRef = useRef<HybridAPI | null>(null);
  const isAuthRef = useRef(false);
  useEffect(() => { apiRef.current = api; }, [api]);
  useEffect(() => { isAuthRef.current = isAuthenticated; }, [isAuthenticated]);

  const initializingRef = useRef(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const lastOverlayRef = useRef<boolean>(isDemoOverlayEnabled());

  const initialize = useCallback(async () => {
    if (initializingRef.current) {
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
        if (DEBUG) console.log('🔄 Initializing Hybrid API (Actual Budget + Supabase):', baseUrl);

        const overlay = isDemoOverlayEnabled();
        let apiInstance: HybridAPI | null = apiRef.current;
        const mustRecreateBase = !apiInstance || overlay !== lastOverlayRef.current;
        if (mustRecreateBase) {
          // Always recreate the base API when overlay flag changes to avoid double-wrapping
          let base = await initHybridAPI(baseUrl);
          apiInstance = overlay ? createDemoOverlayAPI(base) : base;
          lastOverlayRef.current = overlay;
          setApi(apiInstance);
          apiRef.current = apiInstance;
        } else {
          // No overlay change; keep existing instance
          setApi(apiInstance);
          apiRef.current = apiInstance;
        }

        // If demo overlay is active, treat as authenticated (overlay doesn't need backend auth)
        if (isDemoOverlayEnabled()) {
          setIsAuthenticated(true);
          isAuthRef.current = true;
          if (DEBUG) console.log('✅ Demo overlay active: forcing authenticated UI');
        } else {
          // Relaxed gating: if a JWT exists, consider the user authenticated immediately
          // and warm up the connection in the background. This avoids getting stuck on the
          // loading screen if the first accounts call 401s before Supabase refreshes.
          try {
            const token = localStorage.getItem('actual-token');
            const isJwt = !!token && /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token);
            if (isJwt) {
              if (!isAuthRef.current) {
                setIsAuthenticated(true);
                isAuthRef.current = true;
                if (DEBUG) console.log('✅ JWT present; enabling authenticated UI');
              }
              // Warm call without blocking UI; ignore errors
              setTimeout(() => {
                apiInstance.getAccounts().catch((warmErr: any) => {
                  if (DEBUG) console.warn('⚠️ Warm accounts check failed (non-blocking):', warmErr);
                });
              }, 50);
            } else {
              setIsAuthenticated(false);
              isAuthRef.current = false;
              if (DEBUG) console.log('ℹ️ No JWT present; unauthenticated UI');
            }
          } catch (err) {
            if (DEBUG) console.warn('❌ Auth gating encountered an error', err);
            setIsAuthenticated(false);
            isAuthRef.current = false;
          }
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
  }, [DEBUG]);

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
