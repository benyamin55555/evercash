import { LucideIcon } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative";
  icon: LucideIcon;
  contributors?: { name: string; value: string }[];
  onContributorClick?: (name: string) => void;
}

export function StatCard({ title, value, change, changeType, icon: Icon, contributors, onContributorClick }: StatCardProps) {
  const { theme } = useTheme();
  return (
    <div className="glass-card-hover p-4 md:p-6 rounded-2xl animate-fade-in-up h-full flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between mb-4">
          <div className="p-3 rounded-xl bg-gradient-emerald-subtle">
            <Icon className="w-5 h-5 text-accent" />
          </div>
          {change && (
            <span
              className={`text-sm font-semibold ${
                changeType === "positive" ? "text-accent" : "text-destructive"
              }`}
            >
              {change}
            </span>
          )}
        </div>
        <h3 className="text-xs sm:text-sm text-muted-foreground mb-1">{title}</h3>
        <p className="text-xl sm:text-2xl md:text-3xl font-bold mb-4 leading-tight">{value}</p>
      </div>
      {contributors && contributors.length > 0 && (
        <div className="mt-4 flex-1 flex flex-col justify-center">
          <div className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            Top Contributors
          </div>
          <div className="space-y-2">
            {contributors.map((c, idx) => (
              <div
                key={idx}
                className={`relative overflow-hidden rounded-lg px-3 py-2.5 border transition-all ${
                  theme === 'dark'
                    ? 'bg-gradient-to-br from-green-500/10 to-green-400/5 border-green-500/20 hover:border-green-400/40 hover:shadow-[0_0_12px_rgba(34,197,94,0.15)]'
                    : 'bg-gradient-to-br from-emerald-500/8 to-emerald-400/5 border-emerald-500/20 hover:border-emerald-400/40 hover:shadow-[0_0_12px_rgba(16,185,129,0.12)]'
                } ${onContributorClick ? 'cursor-pointer' : ''}`}
                onClick={onContributorClick ? () => onContributorClick(c.name) : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      theme === 'dark' ? 'bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-emerald-600 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                    }`} />
                    <span className="text-xs sm:text-sm font-medium truncate">{c.name}</span>
                  </div>
                  <span className={`hidden md:inline text-xs sm:text-sm font-bold tabular-nums ${
                    theme === 'dark' ? 'text-green-400' : 'text-emerald-600'
                  }`}>{c.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
