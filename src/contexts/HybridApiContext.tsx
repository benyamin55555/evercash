import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { initHybridAPI, type HybridAPI } from '@/lib/hybrid-api';
import { isDemoOverlayEnabled, createDemoOverlayAPI } from '@/lib/demo-overlay';
import { supabase } from '@/lib/supabase-client';
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
          // DEEP AUDIT: Enhanced authentication check with comprehensive debugging
          console.log('🔐 Starting authentication check...');
          
          try {
            let token = localStorage.getItem('actual-token');
            let isJwt = !!token && /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token!);
            
            console.log('🔑 Initial token state:', {
              hasToken: !!token,
              tokenLength: token?.length,
              isJwt,
              tokenPreview: token ? `${token.substring(0, 20)}...` : 'null'
            });
            
            // Check token expiry if we have one
            if (token && isJwt) {
              try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                const exp = payload.exp * 1000;
                const now = Date.now();
                const timeToExpiry = exp - now;
                console.log('⏰ Token expiry check:', {
                  expiresAt: new Date(exp).toISOString(),
                  currentTime: new Date(now).toISOString(),
                  timeToExpiry: timeToExpiry,
                  isExpiringSoon: timeToExpiry <= 300000 // 5 minutes
                });
                
                if (timeToExpiry <= 300000) {
                  console.log('⚠️ Token expires soon, forcing refresh');
                  token = null;
                  isJwt = false;
                }
              } catch (e) {
                console.warn('⚠️ Failed to parse token expiry, treating as invalid:', e);
                token = null;
                isJwt = false;
              }
            }
            
            // Get fresh token from Supabase if needed
            if ((!token || !isJwt) && supabase) {
              console.log('🔄 Getting fresh session from Supabase...');
              const { data: { session }, error } = await supabase.auth.getSession();
              
              console.log('📋 Supabase session state:', {
                hasSession: !!session,
                hasUser: !!session?.user,
                hasAccessToken: !!session?.access_token,
                tokenLength: session?.access_token?.length,
                userEmail: session?.user?.email,
                error: error?.message
              });
              
              if (error) {
                console.error('❌ Supabase getSession error:', error);
                throw new Error(`Supabase session error: ${error.message}`);
              }
              
              const newToken = session?.access_token;
              if (newToken) {
                try { 
                  localStorage.setItem('actual-token', newToken); 
                  console.log('💾 Saved fresh token to localStorage');
                } catch (e) {
                  console.error('❌ Failed to save token to localStorage:', e);
                }
                token = newToken;
                isJwt = true;
                console.log('✅ Using fresh token from Supabase session');
              } else {
                console.warn('⚠️ No access token in Supabase session - user needs to sign in');
                setIsAuthenticated(false);
                isAuthRef.current = false;
                return;
              }
            }

            // Test authentication with accounts call
            if (isJwt && !isAuthRef.current) {
              console.log('🧪 Testing authentication with getAccounts call...');
              const startTime = Date.now();
              
              try {
                const accounts = await apiInstance.getAccounts();
                const duration = Date.now() - startTime;
                
                console.log('✅ Authentication successful:', {
                  accountCount: accounts?.length || 0,
                  duration: `${duration}ms`,
                  authenticated: true
                });
                
                setIsAuthenticated(true);
                isAuthRef.current = true;
              } catch (accountsError) {
                console.error('❌ Authentication test failed with accounts call:', accountsError);
                
                // If it's a 401, the request layer should have handled retry
                // If we still get here, authentication truly failed
                setIsAuthenticated(false);
                isAuthRef.current = false;
                throw accountsError;
              }
            } else if (!isJwt) {
              console.warn('⚠️ No valid JWT token available for authentication');
              setIsAuthenticated(false);
              isAuthRef.current = false;
            } else {
              console.log('ℹ️ Already authenticated, skipping auth check');
            }
          } catch (err) {
            console.error('❌ Authentication check failed:', err);
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
