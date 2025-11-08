import { useState } from "react";
import {
  Building2,
  Upload,
  Link2,
  Users,
  Settings,
  Menu,
  X
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CurrencySelector } from "@/components/CurrencySelector";
import { useSimpleCurrency } from "@/contexts/SimpleCurrencyContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUser } from "@/contexts/UserContext";

// Secondary navigation items - main pages are handled by bottom navigation
const navItems = [
  { title: "Accounts", url: "/accounts", icon: Building2 },
  { title: "Import", url: "/import", icon: Upload },
  { title: "Bank Sync", url: "/bank-sync", icon: Link2 },
  { title: "Sharing", url: "/sharing", icon: Users },
  { title: "Settings", url: "/settings", icon: Settings },
];

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNavDrawer({ isOpen, onClose }: MobileNavProps) {
  const { currentCurrency, setCurrency } = useSimpleCurrency();
  const { theme } = useTheme();
  const { user: authUser } = useAuth();
  const { user } = useUser();
  
  // Get user initials
  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };
  
  // Priority: UserContext (Settings) → AuthContext → Email → Fallback
  const userName = user?.name || authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0] || 'User';
  const userInitials = getInitials(userName);
  
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sliding drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-background text-foreground shadow-xl z-50 transform transition-transform duration-300 ease-in-out md:hidden ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center justify-center">
            <h2 
              className="font-bold text-xl"
              style={theme === 'dark' ? {
                color: 'white'
              } : {
                background: 'linear-gradient(to right, #059669, #34d399)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >EVERCASH</h2>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={onClose} className="text-foreground hover:bg-accent/10">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Currency Selector Section */}
        <div className="p-4 border-b border-border">
          <p className="px-3 text-muted-foreground uppercase text-xs tracking-wider font-semibold mb-3">
            Currency
          </p>
          <div className="px-3 text-emerald-600 dark:text-emerald-400">
            <CurrencySelector
              value={currentCurrency}
              onChange={setCurrency}
              showIcon={true}
              className="w-full [&_button]:!text-emerald-600 dark:[&_button]:!text-emerald-400 [&_button]:!border-emerald-500/50"
            />
          </div>
        </div>

        {/* Navigation */}
        <div className="p-4">
          <p className="px-3 text-muted-foreground uppercase text-xs tracking-wider font-semibold mb-4">
            Tools & Features
          </p>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.title}
                to={item.url}
                end
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                    isActive
                      ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/30 font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/10 font-medium"
                  }`
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.title}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* User info at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="bg-gradient-to-br from-[#10B981]/10 to-[#10B981]/20 border border-[#10B981]/30 p-4 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#10B981] to-[#10B981] flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.4)]">
                <span className="text-sm font-bold text-black">{userInitials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate text-emerald-600 dark:text-white">{userName}</p>
                <p className="text-xs text-[#10B981] font-medium">Premium</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function MobileNavButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        data-tutorial="mobile-menu-button"
        className="md:hidden p-2 rounded-lg border border-border/70 text-gray-800 dark:text-white hover:bg-accent/10 bg-background/80"
      >
        <Menu className="w-5 h-5" />
      </Button>

      <MobileNavDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
