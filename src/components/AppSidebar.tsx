import {
  LayoutDashboard,
  Wallet,
  Building2,
  Receipt,
  BarChart3,
  Target,
  Upload,
  Link2,
  Users,
  Settings
} from "lucide-react";
import { NavLink } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useUser } from "@/contexts/UserContext";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, dataTutorial: "dashboard-nav" },
  { title: "Accounts", url: "/accounts", icon: Building2, dataTutorial: "accounts-nav" },
  { title: "Budgets", url: "/budgets", icon: Wallet, dataTutorial: "budgets-nav" },
  { title: "Transactions", url: "/transactions", icon: Receipt, dataTutorial: "transactions-nav" },
  { title: "Reports", url: "/reports", icon: BarChart3, dataTutorial: "reports-nav" },
  { title: "Goals", url: "/goals", icon: Target, dataTutorial: "goals-nav" },
  { title: "Import", url: "/import", icon: Upload, dataTutorial: "import-nav" },
  { title: "Bank Sync", url: "/bank-sync", icon: Link2, dataTutorial: "banksync-nav" },
  { title: "Sharing", url: "/sharing", icon: Users, dataTutorial: "sharing-nav" },
  { title: "Settings", url: "/settings", icon: Settings, dataTutorial: "settings-nav" },
];

interface AppSidebarProps {
  className?: string;
}

export function AppSidebar({ className }: AppSidebarProps) {
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
    <Sidebar className={`border-r border-border shadow-sm bg-sidebar ${className || ''}`}>
      <SidebarContent className="bg-sidebar">
        <div className="p-4 pt-6">
          <div className="bg-gradient-to-br from-[#7BEF2D]/10 to-[#7BEF2D]/20 border border-[#7BEF2D]/30 p-4 rounded-xl shadow-[0_0_15px_rgba(123,239,45,0.2)]">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#7BEF2D] to-[#7BEF2D] flex items-center justify-center shadow-[0_0_10px_rgba(123,239,45,0.4)]">
                <span className="text-sm font-bold text-black">{userInitials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate text-emerald-600 dark:text-white">{userName}</p>
                <p className="text-xs text-[#7BEF2D] font-medium">Premium</p>
              </div>
            </div>
          </div>
        </div>

        <SidebarGroup className="px-3">
          <SidebarGroupLabel className="px-3 text-emerald-500/70 dark:text-white/70 uppercase text-xs tracking-wider font-semibold mb-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1.5">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <NavLink
                    to={item.url}
                    end
                    data-tutorial={item.dataTutorial}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                        isActive
                          ? "bg-gradient-to-r from-[#7BEF2D] to-[#7BEF2D] text-black shadow-lg shadow-[rgba(123,239,45,0.3)] font-semibold"
                          : "text-emerald-600 dark:text-white hover:text-[#7BEF2D] hover:bg-[#7BEF2D]/10 font-medium"
                      }`
                    }
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    <span>{item.title}</span>
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
