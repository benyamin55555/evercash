// Centralized authentication manager for proactive token refresh
import { supabase } from '@/lib/supabase-client';

export class AuthManager {
  private static instance: AuthManager | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRefreshing = false;
  private readonly DEBUG = (import.meta as any)?.env?.VITE_DEBUG_LOGS === 'true';

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  private constructor() {
    this.startProactiveRefresh();
  }

  private startProactiveRefresh() {
    // Check and refresh token every 5 minutes
    this.refreshTimer = setInterval(async () => {
      await this.ensureFreshToken();
    }, 5 * 60 * 1000); // 5 minutes

    console.log('🔄 AuthManager: Started proactive token refresh (5min intervals)');
  }

  async ensureFreshToken(): Promise<string | null> {
    if (this.isRefreshing) {
      console.log('🔄 AuthManager: Token refresh already in progress, waiting...');
      // Wait for ongoing refresh
      while (this.isRefreshing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return localStorage.getItem('actual-token');
    }

    try {
      this.isRefreshing = true;
      
      const currentToken = localStorage.getItem('actual-token');
      let needsRefresh = false;
      
      if (!currentToken) {
        console.log('🔄 AuthManager: No token found, fetching from Supabase');
        needsRefresh = true;
      } else {
        // Check if token is expired or expiring soon
        try {
          const payload = JSON.parse(atob(currentToken.split('.')[1]));
          const exp = payload.exp * 1000;
          const now = Date.now();
          const timeToExpiry = exp - now;
          
          if (timeToExpiry <= 600000) { // Less than 10 minutes
            console.log('🔄 AuthManager: Token expires soon, refreshing:', {
              expiresAt: new Date(exp).toISOString(),
              timeToExpiry: `${Math.round(timeToExpiry / 1000 / 60)}min`
            });
            needsRefresh = true;
          }
        } catch (e) {
          console.warn('⚠️ AuthManager: Failed to parse token, treating as expired');
          needsRefresh = true;
        }
      }

      if (needsRefresh && supabase) {
        console.log('🔄 AuthManager: Refreshing session...');
        
        // Try refreshSession first
        let { data: { session }, error } = await supabase.auth.refreshSession();
        
        if (error || !session?.access_token) {
          console.log('🔄 AuthManager: RefreshSession failed, trying getSession...');
          const result = await supabase.auth.getSession();
          session = result.data.session;
          error = result.error;
        }
        
        if (error) {
          console.error('❌ AuthManager: Session refresh failed:', error);
          return currentToken; // Return existing token if refresh fails
        }
        
        if (session?.access_token) {
          try {
            localStorage.setItem('actual-token', session.access_token);
            console.log('✅ AuthManager: Token refreshed successfully');
            return session.access_token;
          } catch (e) {
            console.error('❌ AuthManager: Failed to save refreshed token:', e);
          }
        }
      }
      
      return currentToken;
    } catch (error) {
      console.error('❌ AuthManager: Token refresh failed:', error);
      return localStorage.getItem('actual-token');
    } finally {
      this.isRefreshing = false;
    }
  }

  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    console.log('🔄 AuthManager: Destroyed');
  }
}

// Initialize the singleton instance
export const authManager = AuthManager.getInstance();
