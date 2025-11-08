import { useState, useEffect } from "react";
import { User, Shield, Database, CreditCard, Crown, Moon, Sun, Download, FileText, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useApi } from "@/contexts/HybridApiContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { seedDemoData, clearDemoData } from "@/lib/seed-demo";
import { isDemoOverlayEnabled, setDemoOverlayEnabled, resetDemoOverlayData } from "@/lib/demo-overlay";

// Integration note: Use useSettings() to persist preferences
// Store theme in localStorage or sync with user profile
export default function Settings() {
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { user, setUser } = useUser();
  const { user: authUser, signOut } = useAuth();
  const { api } = useApi();
  const [nameInput, setNameInput] = useState(user?.name || '');
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [demoStats, setDemoStats] = useState<{ netWorth: number; txCount: number } | null>(null);
  const [creditsTotal, setCreditsTotal] = useState<number | null>(null);
  const [creditsUsed, setCreditsUsed] = useState<number | null>(null);
  const [isPremiumPlan, setIsPremiumPlan] = useState(false);
  const [creditsLoading, setCreditsLoading] = useState(false);

  // Update inputs when user changes
  useEffect(() => {
    setNameInput(user?.name || '');
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!api) return;
      // Overlay takes precedence
      if (isDemoOverlayEnabled()) {
        try {
          const [accs, tx] = await Promise.all([api.getAccounts(), api.getTransactions()]);
          if (!cancelled) {
            setIsDemo(true);
            const netWorth = (accs || []).reduce((s: number, a: any) => s + (a.balance || 0), 0);
            setDemoStats({ netWorth, txCount: tx.length });
          }
        } catch {}
        return;
      }
      try {
        const [accs, tx] = await Promise.all([api.getAccounts(), api.getTransactions()]);
        const hasDemoTx = (tx || []).some(t => (t.notes || '').toString().startsWith('DEMO'));
        const hasDemoAcc = (accs || []).some(a => (a.name || '').toString().startsWith('Demo '));
        if (!cancelled) {
          setIsDemo(hasDemoTx || hasDemoAcc);
          if (hasDemoTx || hasDemoAcc) {
            const netWorth = (accs || []).reduce((s: number, a: any) => s + (a.balance || 0), 0);
            setDemoStats({ netWorth, txCount: tx.length });
          } else {
            setDemoStats(null);
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!api) return;
      try {
        setCreditsLoading(true);
        const info = await api.getImportCredits();
        if (!cancelled) {
          setCreditsTotal(info.import_credits_total || 0);
          setCreditsUsed(info.import_credits_used || 0);
          setIsPremiumPlan(!!info.is_premium);
        }
      } catch {}
      finally { if (!cancelled) setCreditsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [api]);

  const refreshCredits = async () => {
    if (!api) return;
    try {
      setCreditsLoading(true);
      const info = await api.getImportCredits();
      setCreditsTotal(info.import_credits_total || 0);
      setCreditsUsed(info.import_credits_used || 0);
      setIsPremiumPlan(!!info.is_premium);
    } catch {}
    finally { setCreditsLoading(false); }
  };

  const handleSaveProfile = () => {
    if (user) {
      setUser({
        ...user,
        name: nameInput
      });
      toast({
        title: "Profile Updated",
        description: "Your profile information has been saved.",
      });
    }
  };

  const loadRazorpay = () => new Promise<void>((resolve, reject) => {
    if ((window as any).Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay')); 
    document.body.appendChild(script);
  });

  const handleUpgrade = async () => {
    if (!api) return;
    setIsPaying(true);
    try {
      await loadRazorpay();
      const amount = 4.99; // USD dollars
      const order = await api.createRazorpayOrder(amount, 'USD', { plan: 'premium_monthly' });
      const rzp = new (window as any).Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: 'Evercash',
        description: 'Premium Upgrade',
        order_id: order.order_id,
        prefill: {
          name: user?.name || authUser?.email || 'User',
          email: authUser?.email || '',
        },
        theme: { color: '#7BEF2D' },
        handler: async (response: any) => {
          try {
            await api.verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast({ title: 'Payment successful', description: 'Thanks for upgrading to Premium!' });
            try { await refreshCredits(); } catch {}
          } catch (err) {
            toast({ title: 'Verification failed', description: 'Please contact support.', variant: 'destructive' as any });
          }
        },
      });
      rzp.on('payment.failed', () => {
        toast({ title: 'Payment failed', description: 'Your payment could not be completed.', variant: 'destructive' as any });
      });
      rzp.open();
    } catch (e: any) {
      toast({ title: 'Unable to start payment', description: e?.message || 'Please try again later.', variant: 'destructive' as any });
    } finally {
      setIsPaying(false);
    }
  };
  const handleEnterDemo = async () => {
    if (demoBusy) return;
    setDemoBusy(true);
    try {
      try { localStorage.removeItem('evercash_demo_exited'); } catch {}
      // Always reset to the canonical demo dataset
      resetDemoOverlayData();
      setDemoOverlayEnabled(true);
      // Fast reload to re-init API with overlay
      window.location.reload();
    } finally {
      setDemoBusy(false);
    }
  };
  const handleExitDemo = async () => {
    if (demoBusy) return;
    setDemoBusy(true);
    try {
      if (isDemoOverlayEnabled()) {
        setDemoOverlayEnabled(false);
        try { localStorage.setItem('evercash_demo_exited', 'true'); } catch {}
        setIsDemo(false);
        setDemoStats(null);
        toast({ title: 'Demo mode disabled', description: 'Overlay turned off' });
        window.location.reload();
        return;
      }
      if (!api) return;
      await clearDemoData(api);
      try { localStorage.setItem('evercash_demo_exited', 'true'); } catch {}
      setIsDemo(false);
      setDemoStats(null);
      toast({ title: 'Demo mode disabled', description: 'Demo data cleared' });
      window.location.reload();
    } finally {
      setDemoBusy(false);
    }
  };
  return (
    <div className="p-8 space-y-8 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-4xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <div className="glass-card p-8 rounded-2xl space-y-6 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-6 h-6 text-accent" />
          <h2 className="text-2xl font-bold">Profile Information</h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Enter your name"
              className="mt-2 bg-muted/30 border-border/50"
            />
          </div>
          <div className="grid gap-2 text-sm pt-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Google Email</span>
              <span className="font-mono text-xs">{authUser?.email || '—'}</span>
            </div>
          </div>
        </div>
        
        <Button onClick={handleSaveProfile} className="mt-4">
          Save Profile
        </Button>
        <Button
          variant="outline"
          className="mt-2"
          onClick={() => { window.location.href = '/logout'; }}
        >
          Log out
        </Button>
      </div>

      <div className="glass-card p-8 rounded-2xl space-y-6 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-6 h-6 text-accent" />
          <h2 className="text-2xl font-bold">Demo Mode</h2>
        </div>
        <p className="text-sm text-muted-foreground">Preview exactly what a brand-new user sees. This seeds realistic data and shows a demo banner. You can exit anytime.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleEnterDemo} disabled={demoBusy} className="sm:w-auto">
            {demoBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Enter Demo Mode
          </Button>
          <Button variant="outline" onClick={handleExitDemo} disabled={demoBusy} className="sm:w-auto">
            {demoBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Exit Demo Mode
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {isDemo && demoStats ? (
            <span>Currently in demo mode • Net worth {demoStats.netWorth.toLocaleString()} • {demoStats.txCount} transactions</span>
          ) : (
            <span>Not in demo mode</span>
          )}
        </div>
      </div>

      <div className="glass-card p-8 rounded-2xl space-y-6 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-6 h-6 text-accent" />
          <h2 className="text-2xl font-bold">Import Credits</h2>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">{isPremiumPlan ? 'Premium' : 'Free'}</p>
            <p className="text-sm text-muted-foreground">
              {creditsTotal == null || creditsUsed == null
                ? '—'
                : `Remaining: ${(creditsTotal - creditsUsed) < 0 ? 0 : (creditsTotal - creditsUsed)} of ${creditsTotal}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refreshCredits} disabled={creditsLoading}>
              {creditsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="glass-card p-8 rounded-2xl space-y-6 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <Moon className="w-6 h-6 text-accent" />
          <h2 className="text-2xl font-bold">Appearance</h2>
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Dark Mode</p>
            <p className="text-sm text-muted-foreground">Toggle between light and dark themes</p>
          </div>
          <Switch
            checked={theme === 'dark'}
            onCheckedChange={() => {
              toggleTheme();
              toast({ title: theme === 'dark' ? 'Light mode enabled' : 'Dark mode enabled' });
            }}
          />
        </div>
      </div>

      {/* AI Features temporarily hidden: provider is fixed to Hugging Face BERT */}

      <div className="glass-card p-8 rounded-2xl space-y-6 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-6 h-6 text-accent" />
          <h2 className="text-2xl font-bold">Privacy & Security</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Two-Factor Authentication</p>
              <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
            </div>
            <Switch />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Email Notifications</p>
              <p className="text-sm text-muted-foreground">Receive updates about your budget</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </div>

      <div className="glass-card p-8 rounded-2xl space-y-6 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <Database className="w-6 h-6 text-accent" />
          <h2 className="text-2xl font-bold">Backup & Export</h2>
        </div>
        
        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start h-12 border-accent/30 hover:bg-accent/10"
            onClick={() => setComingSoonOpen(true)}
          >
            <Download className="w-5 h-5 mr-2" />
            Export All Data (JSON)
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start h-12 border-accent/30 hover:bg-accent/10"
            onClick={() => setComingSoonOpen(true)}
          >
            <FileText className="w-5 h-5 mr-2" />
            Export PDF Report
          </Button>
          <div className="glass-card p-4 rounded-xl border-accent/10">
            <p className="text-sm text-muted-foreground mb-2">
              Last backup: Today at 3:45 PM
            </p>
            <p className="text-xs text-muted-foreground">
              Automatic backups happen daily. Download anytime.
            </p>
          </div>
        </div>
      </div>

      <div className="glass-card p-8 rounded-2xl border-accent/30 animate-fade-in-up relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-emerald-subtle opacity-20"></div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <Crown className="w-6 h-6 text-accent animate-glow-pulse" />
            <h2 className="text-2xl font-bold">Upgrade to Premium</h2>
          </div>
          <p className="text-muted-foreground mb-6">
            Unlock advanced features including AI-powered insights, unlimited envelopes, and priority support.
          </p>
          <Button onClick={handleUpgrade} disabled={isPaying} className="bg-gradient-emerald hover:opacity-90 transition-opacity shadow-[0_0_20px_rgba(123,239,45,0.3)] hover:shadow-[0_0_30px_rgba(123,239,45,0.5)]">
            {isPaying ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5 mr-2" />
                Upgrade Now
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Coming Soon Dialog for exports */}
      <Dialog open={comingSoonOpen} onOpenChange={setComingSoonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Coming Soon</DialogTitle>
            <DialogDescription>
              This export feature will be available within a few days. — Regards, Evercash
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
