import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

export function AuthCallback() {
  useEffect(() => {
    (async () => {
      console.log('🔐 AuthCallback: Processing OAuth callback...');
      
      try {
        if (supabase) {
          console.log('🔐 AuthCallback: Exchanging code for session...');
          const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          
          if (error) {
            console.error('❌ AuthCallback: Session exchange failed:', error);
          } else {
            console.log('✅ AuthCallback: Session exchange successful');
          }
        }
      } catch (e) {
        console.error('❌ AuthCallback: Exception during auth exchange:', e);
      }
      
      // Redirect to dashboard after a brief delay to ensure token is saved
      setTimeout(() => {
        try {
          console.log('🔐 AuthCallback: Redirecting to dashboard...');
          window.location.replace('/');
        } catch (e) {
          console.error('❌ AuthCallback: Redirect failed:', e);
          // Fallback redirect attempt
          try {
            window.location.href = '/';
          } catch {}
        }
      }, 1000);
    })();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
        <h2 className="text-2xl font-bold">Signing you in...</h2>
        <p className="text-muted-foreground">Please wait while we complete your authentication</p>
      </div>
    </div>
  );
}
