import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { 
  supabase, 
  signInWithGoogle, 
  signOut as supabaseSignOut,
  getUserProfile,
  createUserProfile,
  UserProfile
} from '@/lib/supabase-client';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!user) return;
    
    const userProfile = await getUserProfile(user.id);
    if (userProfile) {
      setProfile(userProfile);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fallback = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 4000);

    // If Supabase isn't configured, skip auth listener
    let subscription: { unsubscribe: () => void } | null = null;
    if (supabase) {
      const sub = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;
        
        console.log('🔄 AuthContext: Auth state change:', {
          event,
          hasSession: !!session,
          hasUser: !!session?.user,
          hasAccessToken: !!session?.access_token,
          tokenLength: session?.access_token?.length,
          userEmail: session?.user?.email
        });
        
        setUser(session?.user ?? null);
        if (session?.user) {
          if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.access_token) {
            try { 
              localStorage.setItem('actual-token', session.access_token);
              console.log('💾 AuthContext: Saved access token to localStorage for event:', event);
            } catch (e) {
              console.error('❌ AuthContext: Failed to save token:', e);
            }
          }
          await fetchProfile(session.user.id);
        } else {
          try { 
            if (event === 'SIGNED_OUT') {
              localStorage.removeItem('actual-token');
              console.log('🗑️ AuthContext: Removed access token on sign out');
            }
          } catch {}
          setProfile(null);
        }
      });
      subscription = sub.data.subscription;
    }

    // Initial session check, always end loading
    (async () => {
      try {
        if (supabase) {
          console.log('🔄 AuthContext: Initial session check...');
          const { data: { session }, error } = await supabase.auth.getSession();
          
          console.log('📋 AuthContext: Initial session state:', {
            hasSession: !!session,
            hasUser: !!session?.user,
            hasAccessToken: !!session?.access_token,
            tokenLength: session?.access_token?.length,
            userEmail: session?.user?.email,
            error: error?.message
          });
          
          if (error) {
            console.warn('❌ AuthContext: Supabase getSession error:', error);
          }
          if (!isMounted) return;
          setUser(session?.user ?? null);
          if (session?.user) {
            // On boot, store the real access token for server Authorization header
            try {
              if (session?.access_token) {
                localStorage.setItem('actual-token', session.access_token);
                console.log('💾 AuthContext: Initial token saved to localStorage');
              }
            } catch (e) {
              console.error('❌ AuthContext: Failed to save initial token:', e);
            }
            await fetchProfile(session.user.id);
          }
        }
      } catch (err) {
        console.error('❌ AuthContext: Supabase getSession failed:', err);
      } finally {
        clearTimeout(fallback);
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
      clearTimeout(fallback);
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      let userProfile = await getUserProfile(userId);
      
      // Create profile if it doesn't exist
      if (!userProfile && user) {
        userProfile = await createUserProfile({
          id: userId,
          email: user.email!,
          full_name: user.user_metadata.full_name || '',
          avatar_url: user.user_metadata.avatar_url || '',
          onboarding_completed: false,
        });
      }
      
      setProfile(userProfile);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignInWithGoogle = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const handleSignOut = async () => {
    try {
      try { localStorage.removeItem('actual-token'); } catch {}
      try {
        const keys = Object.keys(localStorage);
        keys.forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k); });
      } catch {}
      try {
        await supabase.auth.signOut({ scope: 'global' } as any);
      } catch {}
      await supabaseSignOut();
      setUser(null);
      setProfile(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const value = {
    user,
    profile,
    loading,
    signInWithGoogle: handleSignInWithGoogle,
    signOut: handleSignOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
