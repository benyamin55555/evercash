import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useSimpleCurrency } from "@/contexts/SimpleCurrencyContext";
import { useTheme } from "@/contexts/ThemeContext";

interface NetWorthCircleProps {
  netWorth: number;
  target: number;
  surplusDeficit?: number;
}

interface NetWorthCircleEditableProps extends NetWorthCircleProps {
  editingTarget: boolean;
  setEditingTarget: (v: boolean) => void;
  targetInput: string;
  setTargetInput: (v: string) => void;
  setNetWorthTarget: (v: number) => void;
}

export function NetWorthCircle({ netWorth, target, surplusDeficit, editingTarget, setEditingTarget, targetInput, setTargetInput, setNetWorthTarget }: NetWorthCircleEditableProps) {
  const { formatAmount } = useSimpleCurrency();
  const { theme } = useTheme();
  const percentage = Math.min((netWorth / target) * 100, 100);
  const data = [
    { name: "Current", value: percentage },
    { name: "Remaining", value: 100 - percentage },
  ];

  const COLORS = theme === 'dark' 
    ? ["#10B981", "rgba(255,255,255,0.06)"] 
    : ["#10B981", "rgba(0,0,0,0.08)"];

  return (
    <div className="glass-card p-8 rounded-2xl animate-scale-in relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-emerald-subtle opacity-20"></div>
      <div className="relative">
        <h2 className="text-lg font-semibold mb-6 text-center">Net Worth</h2>
        <div className={`relative ${theme === 'dark' ? 'drop-shadow-[0_0_30px_rgba(16,185,129,0.4)]' : ''}`}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={100}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <button
              onClick={() => setEditingTarget(true)}
              className={`text-4xl font-bold hover:scale-105 transition-transform cursor-pointer ${
                theme === 'dark' 
                  ? 'text-[#10B981] [text-shadow:_0_0_20px_rgba(16,185,129,0.6)]' 
                  : 'text-green-700'
              }`}
              title="Click to edit target"
            >
              {netWorth >= 1000 ? `${formatAmount(netWorth / 1000)}k`.replace(/\.00/g, '') : formatAmount(netWorth)}
            </button>
            <p className="text-sm text-muted-foreground mt-1">
              {percentage.toFixed(0)}% of goal
            </p>
          </div>
        </div>
        {editingTarget && (
          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground mb-2">Edit Target</p>
            <div className="flex items-center justify-center gap-2">
              <input
                type="number"
                min={0}
                value={targetInput}
                onChange={e => setTargetInput(e.target.value)}
                className="w-32 px-3 py-2 rounded border focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Enter target"
                autoFocus
              />
              <button
                className="px-3 py-2 text-sm text-white bg-green-600 rounded hover:bg-green-700 font-medium"
                onClick={() => {
                  const val = Number(targetInput);
                  if (!isNaN(val) && val > 0) {
                    setNetWorthTarget(val);
                    localStorage.setItem('netWorthTarget', val.toString());
                    setEditingTarget(false);
                  }
                }}
              >Save</button>
              <button
                className="px-3 py-2 text-sm text-muted-foreground border rounded hover:bg-gray-50"
                onClick={() => setEditingTarget(false)}
              >Cancel</button>
            </div>
          </div>
        )}
        
        {/* Surplus/Deficit Display */}
        {surplusDeficit !== undefined && !editingTarget && (
          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground mb-1">Monthly Status</p>
            <div className={`flex items-center justify-center gap-2 ${
              surplusDeficit >= 0 
                ? theme === 'dark' ? 'text-[#10B981]' : 'text-green-600'
                : 'text-red-600'
            }`}>
              <span className="text-lg font-semibold">
                {surplusDeficit >= 0 ? 'Surplus' : 'Deficit'}
              </span>
              <span className="text-xl font-bold">
                {formatAmount(Math.abs(surplusDeficit))}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Target: {target >= 1000 ? `${formatAmount(target / 1000)}k`.replace(/\.00/g, '') : formatAmount(target)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
