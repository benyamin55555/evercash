import { Loader2, Sparkles, TrendingUp, PiggyBank, Wallet, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';

export default function Landing() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-gray-900 dark:via-emerald-950 dark:to-gray-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.1),transparent_50%)] animate-pulse" />
      </div>

      {/* Floating money icons - Left side */}
      <div className="absolute left-10 top-20 animate-float-slow">
        <DollarSign className="w-12 h-12 text-[#10B981]/30" />
      </div>
      <div className="absolute left-20 bottom-32 animate-float-slower">
        <PiggyBank className="w-16 h-16 text-teal-400/30" />
      </div>
      <div className="absolute left-32 top-1/2 animate-float">
        <Wallet className="w-10 h-10 text-[#10B981]/30" />
      </div>

      {/* Floating money icons - Right side */}
      <div className="absolute right-16 top-32 animate-float">
        <TrendingUp className="w-14 h-14 text-[#10B981]/30" />
      </div>
      <div className="absolute right-24 bottom-24 animate-float-slow">
        <Sparkles className="w-12 h-12 text-teal-400/30" />
      </div>
      <div className="absolute right-40 top-2/3 animate-float-slower">
        <DollarSign className="w-10 h-10 text-[#10B981]/30" />
      </div>

      {/* Floating coins */}
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="absolute w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 opacity-20 animate-float-slower"
          style={{
            left: `${10 + i * 12}%`,
            top: `${20 + (i % 3) * 25}%`,
            animationDelay: `${i * 0.5}s`,
          }}
        />
      ))}

      {/* Main card */}
      <div className="relative z-10 w-full max-w-md mx-4 animate-fade-in-up">
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border-2 border-[#10B981] p-8 space-y-8">
          {/* Logo & Title */}
          <div className="text-center space-y-4">
            <div>
              <h1 className="text-4xl font-extrabold !text-[#10B981]">
                EVERCASH
              </h1>
              <p className="text-sm !text-black dark:text-gray-300 mt-2 font-bold">
                Smart budget management with AI-powered insights
              </p>
            </div>
          </div>

          {/* Onboarding text */}
          <div className="text-center px-2">
            <p className="!text-black dark:text-gray-200 leading-relaxed font-bold text-base">
              Start by signing in to your account.
            </p>
            <p className="text-sm !text-black dark:text-gray-300 mt-2 font-semibold">
              New here? Sign up and we'll guide you through a quick onboarding to set up your budget and first goal.
            </p>
          </div>

          {/* Auth buttons */}
          <div className="space-y-3">
            <Button
              onClick={handleSignIn}
              disabled={loading}
              className="w-full h-14 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 !text-black dark:text-white border-2 border-gray-800 dark:border-gray-600 hover:border-[#10B981] dark:hover:border-gray-500 transition-all duration-300 shadow-md hover:shadow-lg group"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-3 !text-black dark:text-gray-300" />
                  <span className="font-bold !text-black dark:text-white">Signing in...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-3 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span className="font-bold !text-black dark:text-white">Sign in/up with Google</span>
                </>
              )}
            </Button>
          </div>

          {/* Security badge */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-[#10B981] dark:text-[#10B981]">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-xs font-medium">Your data is encrypted and secure</span>
            </div>
            <p className="text-xs !text-gray-800 dark:text-gray-400 font-semibold">
              Powered by Supabase • Terms • Privacy
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-30px) rotate(5deg); }
        }
        @keyframes float-slower {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-25px) rotate(-5deg); }
        }
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .animate-float-slow {
          animation: float-slow 8s ease-in-out infinite;
        }
        .animate-float-slower {
          animation: float-slower 10s ease-in-out infinite;
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
