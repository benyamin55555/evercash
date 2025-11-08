import React, { useMemo, useRef, useState, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useSimpleCurrency } from "@/contexts/SimpleCurrencyContext";
import type { Transaction as ApiTransaction } from "@/lib/api";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DashboardSlidesProps {
  transactions: ApiTransaction[];
  accounts: any[];
}

function monthKey(d: Date) {
  return d.toISOString().slice(0, 7);
}

export function DashboardSlides({ transactions, accounts }: DashboardSlidesProps) {
  const { theme } = useTheme();
  const { formatAmount } = useSimpleCurrency();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  
  const scrollSlide = (dir: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const w = scroller.clientWidth;
    scroller.scrollTo({ left: scroller.scrollLeft + dir * w, behavior: "smooth" });
  };
  
  // Track scroll position to update dots
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    
    const handleScroll = () => {
      const w = scroller.clientWidth;
      const scrollLeft = scroller.scrollLeft;
      const slideIndex = Math.round(scrollLeft / w);
      setCurrentSlide(slideIndex);
    };
    
    scroller.addEventListener('scroll', handleScroll);
    return () => scroller.removeEventListener('scroll', handleScroll);
  }, []);

  const {
    mtdSpend,
    projectedEom,
    monthlyAvg3,
    runwayMonths,
    dailySeries,
    anomalies,
    pacingSeries
  } = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed = now.getDate();

    const byMonth: Record<string, { income: number; expense: number }> = {};
    let mtdExpense = 0;

    transactions.forEach((tx) => {
      const d = new Date(tx.date || "");
      if (isNaN(d.getTime())) return;
      const key = monthKey(d);
      if (!byMonth[key]) byMonth[key] = { income: 0, expense: 0 };
      if ((tx.amount || 0) > 0) byMonth[key].income += tx.amount || 0;
      if ((tx.amount || 0) < 0) byMonth[key].expense += Math.abs(tx.amount || 0);
      const curKey = monthKey(now);
      if (key === curKey && (tx.amount || 0) < 0) mtdExpense += Math.abs(tx.amount || 0);
    });

    // Last 3 full months (exclude current)
    const months: string[] = [];
    const anchor = new Date(now);
    anchor.setDate(1);
    for (let i = 1; i <= 3; i++) {
      const d = new Date(anchor);
      d.setMonth(anchor.getMonth() - i);
      months.push(monthKey(d));
    }
    const last3 = months.map((k) => byMonth[k]?.expense || 0);
    const monthlyAvg3 = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;

    const projectedEom = daysPassed > 0 ? (mtdExpense / daysPassed) * daysInMonth : mtdExpense;

    // Runway
    const liquid = (accounts || [])
      .filter((a: any) => !a.closed)
      .reduce((sum: number, a: any) => sum + (a.balance || 0), 0);
    const burn = Math.max(1, monthlyAvg3 || 0); // avoid div by 0
    const runwayMonths = liquid / burn;

    // Daily series (last 30 days)
    const days: { date: string; amount: number }[] = [];
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);

    const byDay: Record<string, number> = {};
    transactions.forEach((tx) => {
      const d = new Date(tx.date || "");
      if (isNaN(d.getTime())) return;
      const iso = d.toISOString().slice(0, 10);
      if (!byDay[iso]) byDay[iso] = 0;
      if ((tx.amount || 0) < 0) byDay[iso] += Math.abs(tx.amount || 0);
    });

    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      days.push({ date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), amount: byDay[iso] || 0 });
    }

    const values = days.map((d) => d.amount);
    const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (values.length || 1);
    const std = Math.sqrt(variance);
    const anomalies = days.map((d) => d.amount > mean + 2 * std);

    // MTD pacing series: cumulative actual vs expected baseline
    const curKey = monthKey(now);
    const byDayMonth: Record<number, number> = {};
    transactions.forEach((tx) => {
      const d = new Date(tx.date || "");
      if (isNaN(d.getTime())) return;
      if (monthKey(d) !== curKey) return;
      if ((tx.amount || 0) < 0) {
        const day = d.getDate();
        byDayMonth[day] = (byDayMonth[day] || 0) + Math.abs(tx.amount || 0);
      }
    });
    let running = 0;
    const pacingSeries = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      running += byDayMonth[day] || 0;
      const expected = (monthlyAvg3 / daysInMonth) * day;
      return { day, actual: running, expected };
    });

    return {
      mtdSpend: mtdExpense,
      projectedEom,
      monthlyAvg3,
      runwayMonths,
      dailySeries: days,
      anomalies,
      pacingSeries,
    };
  }, [transactions, accounts]);
 
  const gaugeColor = "#10B981";
  // Cash Runway gauge styling
  const runwayCapped = Math.max(0, Math.min(12, runwayMonths));
  const runwayAngle = (runwayCapped / 12) * 360;
  const runwayFill = runwayMonths < 2 ? '#ef4444' : runwayMonths < 6 ? '#f59e0b' : '#10B981';
  const track = theme === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
  const runwayLabel = runwayMonths >= 1 ? `${runwayMonths.toFixed(1)} mo` : `${Math.max(1, Math.round(runwayMonths * 30))} days`;
  const liquidBalance = (accounts || []).filter((a: any) => !a.closed).reduce((sum: number, a: any) => sum + (a.balance || 0), 0);

  return (
    <div className="glass-card p-0 rounded-2xl border border-border overflow-hidden relative">
      <div
        ref={scrollerRef}
        className="flex overflow-x-auto snap-x snap-mandatory px-0 py-3 md:py-4 overscroll-contain"
        style={{ scrollbarWidth: "none" }}
      >
        {/* Slide 1: MTD Pacing (Actual vs Expected) */}
        <div className="w-full flex-none snap-start snap-always bg-card dark:bg-black border border-border rounded-xl p-3 md:p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-muted-foreground">MTD Pacing</h3>
            <span className={`text-xs font-semibold ${projectedEom > (monthlyAvg3 || 0) ? "text-red-500" : "text-[#10B981]"}`}>
              {projectedEom > (monthlyAvg3 || 0) ? "Over pace" : "On/Under pace"}
            </span>
          </div>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-8">
            <div className="w-full h-[130px] md:h-[240px] md:flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pacingSeries}>
                  <XAxis dataKey="day" hide />
                  <YAxis hide />
                  <Tooltip 
                    formatter={(v: any) => [formatAmount(v as number), ""]}
                    contentStyle={{
                      backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
                      border: theme === 'dark' ? '1px solid #374151' : '1px solid #E5E7EB',
                      borderRadius: '8px',
                      color: theme === 'dark' ? '#F9FAFB' : '#111827'
                    }}
                    labelStyle={{ color: theme === 'dark' ? '#D1D5DB' : '#6B7280' }}
                  />
                  <Area type="monotone" dataKey="actual" stroke={gaugeColor} fill={gaugeColor} fillOpacity={0.2} isAnimationActive />
                  <Line type="monotone" dataKey="expected" stroke={theme === 'dark' ? '#94A3B8' : '#64748B'} strokeDasharray="4 4" dot={false} isAnimationActive />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full md:w-64">
              <div className="text-xs text-muted-foreground">MTD Spend</div>
              <div className="text-lg font-bold">{formatAmount(mtdSpend)}</div>
              <div className="text-xs text-muted-foreground mt-2">Projected Month End</div>
              <div className="text-lg font-bold">{formatAmount(projectedEom)}</div>
              <div className="text-xs text-muted-foreground mt-2">3‑Month Avg (baseline)</div>
              <div className="text-lg font-bold">{formatAmount(monthlyAvg3)}</div>
            </div>
          </div>
        </div>

        {/* Slide 2: Anomaly Pulse */}
        <div className="w-full flex-none snap-start snap-always bg-card dark:bg-black border border-border rounded-xl p-3 md:p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Spending Spikes (30 days)</h3>
          </div>
          <div className="w-full h-[140px] md:h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySeries}>
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip 
                  formatter={(v: any) => [formatAmount(v as number), "Spent"]}
                  contentStyle={{
                    backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
                    border: theme === 'dark' ? '1px solid #374151' : '1px solid #E5E7EB',
                    borderRadius: '8px',
                    color: theme === 'dark' ? '#F9FAFB' : '#111827'
                  }}
                  labelStyle={{ color: theme === 'dark' ? '#D1D5DB' : '#6B7280' }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke={gaugeColor}
                  fill={gaugeColor}
                  fillOpacity={0.2}
                  isAnimationActive
                  dot={(props: any) => {
                    const { cx, cy, index } = props;
                    if (!anomalies[index]) return null;
                    return <circle cx={cx} cy={cy} r={5} fill="#EF4444" stroke="#F87171" strokeWidth={2} />;
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-muted-foreground mt-2">Red pulses mark days with unusually high spend.</div>
        </div>

        {/* Slide 3: Cash Runway Gauge */}
        <div className="w-full flex-none snap-start snap-always bg-card dark:bg-black border border-border rounded-xl p-3 md:p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground">Cash Runway</h3>
            <span className={`text-xs font-semibold ${runwayMonths < 2 ? 'text-red-500' : runwayMonths < 6 ? 'text-yellow-500' : 'text-emerald-500'}`}>{runwayLabel}</span>
          </div>
          <div className="flex flex-col md:flex-row items-center md:items-center gap-3 md:gap-8">
            {/* Circular gauge */}
            <div className="relative w-[140px] h-[140px] md:w-[220px] md:h-[220px]">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(${runwayFill} ${runwayAngle}deg, ${track} 0)`,
                  boxShadow: runwayMonths < 2
                    ? '0 0 25px rgba(239,68,68,0.25)'
                    : runwayMonths < 6
                    ? '0 0 25px rgba(245,158,11,0.25)'
                    : '0 0 25px rgba(123,239,45,0.25)'
                }}
              />
              {/* Inner mask */}
              <div className="absolute inset-3 md:inset-4 rounded-full bg-card dark:bg-black border border-border" />
              {/* Marker dot */}
              <div className="absolute inset-0" style={{ transform: `rotate(${runwayAngle}deg)`, transformOrigin: '50% 50%' }}>
                <div
                  className="absolute left-1/2 -translate-x-1/2 top-1 w-2 h-2 md:w-3 md:h-3 rounded-full"
                  style={{
                    backgroundColor: runwayFill,
                    boxShadow: `0 0 10px ${runwayFill}80, 0 0 18px ${runwayFill}60`
                  }}
                />
              </div>
              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className={`font-bold ${runwayMonths < 2 ? 'text-red-500' : runwayMonths < 6 ? 'text-yellow-500' : 'text-[#10B981]'} text-xl md:text-3xl`}>{runwayLabel}</div>
                <div className="text-[11px] md:text-xs text-muted-foreground">at current burn</div>
              </div>
            </div>
            {/* Details */}
            <div className="w-full md:w-64 space-y-1">
              <div className="flex items-center justify-between text-xs md:text-sm">
                <span className="text-muted-foreground">Liquid Balance</span>
                <span className="font-semibold">{formatAmount(liquidBalance)}</span>
              </div>
              <div className="flex items-center justify-between text-xs md:text-sm">
                <span className="text-muted-foreground">Avg Monthly Burn</span>
                <span className="font-semibold">{formatAmount(monthlyAvg3)}</span>
              </div>
              <div className="text-[11px] md:text-xs text-muted-foreground pt-1">Estimates based on last 3 months average spend.</div>
            </div>
          </div>
        </div>
      </div>
      {/* Desktop arrow controls */}
      <div className="hidden md:flex absolute inset-y-0 left-0 items-center px-2 pointer-events-none">
        <button
          onClick={() => scrollSlide(-1)}
          className="pointer-events-auto p-2 rounded-full bg-background/80 border border-border shadow hover:bg-accent/20 transition"
          aria-label="Previous"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>
      <div className="hidden md:flex absolute inset-y-0 right-0 items-center px-2 pointer-events-none">
        <button
          onClick={() => scrollSlide(1)}
          className="pointer-events-auto p-2 rounded-full bg-background/80 border border-border shadow hover:bg-accent/20 transition"
          aria-label="Next"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      {/* Simple dots */}
      <div className="flex items-center justify-center gap-1 pb-3">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              currentSlide === index ? 'bg-[#10B981]/70 w-2 h-2' : 'bg-muted-foreground/40'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
