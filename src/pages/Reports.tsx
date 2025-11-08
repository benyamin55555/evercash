import { useState, useEffect } from "react";
import { TrendingUp, Download, Loader2, DollarSign, PiggyBank, CreditCard, Calendar, Users, Activity, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from '@/contexts/HybridApiContext';
import { toast } from "sonner";
import type { Transaction, Account, Category } from "@/lib/api";
import { useSimpleCurrency } from "@/contexts/SimpleCurrencyContext";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, BarChart, Bar, AreaChart, Area } from "recharts";
import { useTheme } from "@/contexts/ThemeContext";

export default function Reports() {
  const { api, loading } = useApi();
  const { formatAmount } = useSimpleCurrency();
  const [timeframe, setTimeframe] = useState("month");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (api) {
      loadReportData();
    }
  }, [api, timeframe]);

  const loadReportData = async () => {
    if (!api) return;
    
    setIsLoading(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      
      switch (timeframe) {
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(endDate.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
      }
      
      const [txData, accData, catData] = await Promise.all([
        api.getTransactions(),
        api.getAccounts(),
        api.getCategories() as Promise<Category[]>,
      ]);
      
      setTransactions(txData);
      setAccounts(accData as Account[]);
      setCategories(catData);
    } catch (error) {
      console.error("Error loading report data:", error);
      toast.error("Failed to load report data");
    } finally {
      setIsLoading(false);
    }
  };

  // Using formatAmount from SimpleCurrency context
  // Treat savings allocations as internal (exclude from reports)
  const isInternal = (tx: Transaction) => {
    const cat = (tx.category || '').toLowerCase();
    const payee = (tx.payee || '').toLowerCase();
    const notes = (tx.notes || '').toLowerCase();
    return cat === 'savings' || payee.includes('goal allocation') || notes.includes('goal allocation');
  };

  const baseTransactions = transactions.filter(tx => !isInternal(tx));

  // Dynamic time window: anchor to last meaningful activity if current window has no data
  const periodDays = timeframe === 'week' ? 7 : timeframe === 'quarter' ? 90 : timeframe === 'year' ? 365 : 30;
  const msPerDay = 24 * 60 * 60 * 1000;
  const txDates = baseTransactions
    .map(tx => new Date(tx.date))
    .filter(d => !isNaN(d.getTime()));
  const maxTxDate = txDates.length ? new Date(Math.max(...txDates.map(d => d.getTime()))) : null;
  const today = new Date();
  let endDateWindow = today;
  let startDateWindow = new Date(today);
  startDateWindow.setDate(endDateWindow.getDate() - (periodDays - 1));
  const hasDataInDefaultWindow = baseTransactions.some(tx => {
    const d = new Date(tx.date);
    return d >= startDateWindow && d <= endDateWindow;
  });
  if (!hasDataInDefaultWindow && maxTxDate) {
    endDateWindow = new Date(maxTxDate);
    startDateWindow = new Date(endDateWindow);
    startDateWindow.setDate(endDateWindow.getDate() - (periodDays - 1));
  }
  let windowStart = startDateWindow;
  let windowEnd = endDateWindow;
  let visibleTransactions = baseTransactions.filter(tx => {
    const d = new Date(tx.date);
    return d >= windowStart && d <= windowEnd;
  });
  // Auto-widen if almost empty window
  if ((visibleTransactions.length === 0 || visibleTransactions.length < 5) && baseTransactions.length > visibleTransactions.length) {
    const allDates = baseTransactions.map(tx => new Date(tx.date)).filter(d => !isNaN(d.getTime()));
    if (allDates.length) {
      windowStart = new Date(Math.min(...allDates.map(d => d.getTime())));
      windowEnd = new Date(Math.max(...allDates.map(d => d.getTime())));
      visibleTransactions = baseTransactions.filter(tx => {
        const d = new Date(tx.date);
        return d >= windowStart && d <= windowEnd;
      });
    }
  }
  const windowDayCount = Math.max(1, Math.floor((windowEnd.getTime() - windowStart.getTime()) / msPerDay) + 1);

  // Calculate metrics
  const totalIncome = visibleTransactions
    .filter(tx => tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);
    
  const totalExpenses = Math.abs(visibleTransactions
    .filter(tx => tx.amount < 0)
    .reduce((sum, tx) => sum + tx.amount, 0));
    
  const netIncome = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;
  // Net worth: prefer current account balances (already dollars from API). Exclude closed accounts.
  const hasNumericBalances = Array.isArray(accounts) && accounts.every(a => typeof a.balance === 'number' && !isNaN(a.balance as number));
  const netWorthFromBalances = (accounts || [])
    .filter(acc => !acc.closed)
    .reduce((sum, acc) => sum + (typeof acc.balance === 'number' ? acc.balance : 0), 0);
  // Fallback: derive balances from transactions if balances are missing
  const balancesFromTxMap = (() => {
    const map = new Map<string, number>();
    (transactions || []).forEach(tx => {
      const prev = map.get(tx.account) || 0;
      map.set(tx.account, prev + (tx.amount || 0));
    });
    return map;
  })();
  const netWorthFromTx = (accounts || [])
    .filter(acc => !acc.closed)
    .reduce((sum, acc) => sum + (balancesFromTxMap.get(acc.id) || 0), 0);
  const netWorth = hasNumericBalances ? netWorthFromBalances : netWorthFromTx;
  const rangeLabel = `${windowStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${windowEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  
  // Helper function to get category name
  const getCategoryName = (categoryIdOrName: string) => {
    if (!categoryIdOrName) return 'Uncategorized';
    
    // First try to find by ID
    let category = categories.find(c => c.id === categoryIdOrName);
    
    // If not found by ID, try to find by name (for imported transactions)
    if (!category) {
      category = categories.find(c => c.name === categoryIdOrName);
    }
    
    // If still not found, check if it's already a valid category name
    if (!category) {
      const validCategoryNames = ['Food & Dining', 'Shopping', 'Transportation', 'Entertainment', 
                                 'Bills & Utilities', 'Healthcare', 'Education', 'Travel', 
                                 'Personal Care', 'Gifts & Donations', 'Salary', 'Freelance', 
                                 'Investment', 'Other Income', 'Other'];
      if (validCategoryNames.includes(categoryIdOrName)) {
        return categoryIdOrName;
      }
    }
    
    return category?.name || 'Uncategorized';
  };

  // Group transactions by category name (not ID)
  const transactionsByCategory = visibleTransactions.reduce((acc, tx) => {
    const categoryName = getCategoryName(tx.category);
    if (!acc[categoryName]) {
      acc[categoryName] = [];
    }
    acc[categoryName].push(tx);
    return acc;
  }, {} as Record<string, Transaction[]>);

  // Spending by category
  const categoryBreakdown = Object.entries(transactionsByCategory)
    .map(([categoryName, txs]) => {
      const spent = Math.abs(txs
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + tx.amount, 0));
      return {
        name: categoryName,
        value: spent,
        amount: spent,
        percentage: totalExpenses > 0 ? (spent / totalExpenses) * 100 : 0,
        count: txs.filter(tx => tx.amount < 0).length
      };
    })
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

    // Theme-aware pie colors (using in-app theme)
  // Import useTheme at the top: import { useTheme } from "@/contexts/ThemeContext";
  // Palette: 12 visually distinct colors for each theme
  // Place this at the top: import { useTheme } from "@/contexts/ThemeContext";
  const { theme } = useTheme();
  const colors = theme === 'dark'
    ? [
        '#10B981', '#00E6F6', '#FF00C8', '#FFD600', '#FF3C00', '#00FFB3',
        '#A020F0', '#FF1744', '#00FFEA', '#FFB300', '#10B981', '#FF61A6'
      ]
    : [
        '#10B981', '#2AB67C', '#3FCF8E', '#6EE7B7', '#A7F3D0', '#D1FAE5',
        '#10B981', '#10B981', '#10B981', '#34D399', '#6EE7B7', '#A7F3D0'
      ];
  // Consistent colors for income/expenses bars
  const incomeColor = '#10B981';
  const expenseColor = theme === 'dark' ? '#F87171' : '#EF4444'; // red
  const neutralColor = theme === 'dark' ? '#94A3B8' : '#64748B'; // slate

  // Daily transaction count data
  const dailyTransactionData = (() => {
    const days = Array.from({ length: windowDayCount }, (_, i) => {
      const d = new Date(windowStart);
      d.setDate(windowStart.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const dayTransactions = visibleTransactions.filter(tx => (tx.date || '').startsWith(iso));
      return {
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        transactions: dayTransactions.length,
        expenses: dayTransactions.filter(tx => tx.amount < 0).length,
        income: dayTransactions.filter(tx => tx.amount > 0).length,
        amount: Math.abs(dayTransactions.reduce((sum, tx) => sum + (tx.amount < 0 ? tx.amount : 0), 0))
      };
    });
    return days;
  })();

  // Monthly spending trends
  const monthlyTrendData = (() => {
    const anchor = new Date(windowEnd);
    anchor.setDate(1); // first day of month
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(anchor);
      d.setMonth(anchor.getMonth() - (11 - i));
      return {
        month: d.toISOString().slice(0, 7),
        name: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      };
    });

    return months.map(({ month, name }) => {
      const monthTransactions = baseTransactions.filter(tx => (tx.date || '').startsWith(month));
      const income = monthTransactions.filter(tx => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
      const expenses = Math.abs(monthTransactions.filter(tx => tx.amount < 0).reduce((sum, tx) => sum + tx.amount, 0));
      return { month: name, income, expenses, net: income - expenses };
    });
  })();

  // Top payees/merchants
  const topPayees = (() => {
    const payeeSpending = visibleTransactions
      .filter(tx => tx.amount < 0)
      .reduce((acc, tx) => {
        const payeeName = tx.payee || 'Unknown';
        if (!acc[payeeName]) {
          acc[payeeName] = { name: payeeName, amount: 0, count: 0 };
        }
        acc[payeeName].amount += Math.abs(tx.amount);
        acc[payeeName].count += 1;
        return acc;
      }, {} as Record<string, { name: string; amount: number; count: number }>);

    return Object.values(payeeSpending)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  })();

  // Category spending over time (last 6 months)
  const categoryTrendData = (() => {
    const anchor = new Date(endDateWindow);
    anchor.setDate(1);
    const last6 = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(anchor);
      d.setMonth(anchor.getMonth() - (5 - i));
      return {
        month: d.toISOString().slice(0, 7),
        name: d.toLocaleDateString('en-US', { month: 'short' })
      };
    });

    const topCategories = categoryBreakdown.slice(0, 5).map(c => c.name);

    return last6.map(({ month, name }) => {
      const monthData: any = { month: name };
      topCategories.forEach(categoryName => {
        const categorySpent = baseTransactions
          .filter(tx => (tx.date || '').startsWith(month) && getCategoryName(tx.category) === categoryName && tx.amount < 0)
          .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        monthData[categoryName] = categorySpent;
      });
      return monthData;
    });
  })();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading reports...</span>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl md:text-4xl font-bold mb-2">
            <span className="hidden sm:inline">Reports & Analytics</span>
            <span className="sm:hidden">Reports</span>
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            <span className="hidden sm:inline">Comprehensive financial insights and trends</span>
            <span className="sm:hidden">Financial insights</span>
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-full sm:w-40 h-10 md:h-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">Last 30 days</SelectItem>
              <SelectItem value="quarter">Last 3 months</SelectItem>
              <SelectItem value="year">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            className="bg-gradient-emerald hover:opacity-90 h-10 md:h-auto px-3 md:px-4 text-sm md:text-base"
            onClick={() => toast.info("Export feature coming soon")}
          >
            <Download className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Export Report</span>
            <span className="sm:hidden">Export</span>
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatAmount(totalIncome)}</div>
            <p className="text-xs text-muted-foreground mt-1">{visibleTransactions.filter(tx => tx.amount > 0).length} transactions</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatAmount(totalExpenses)}</div>
            <p className="text-xs text-muted-foreground mt-1">{visibleTransactions.filter(tx => tx.amount < 0).length} transactions</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatAmount(netIncome)}
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Savings Rate</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{savingsRate.toFixed(1)}%</div>
            <Progress value={Math.max(0, Math.min(100, savingsRate))} className="mt-2" />
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Daily Spend</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(totalExpenses / windowDayCount)}</div>
            <p className="text-xs text-muted-foreground mt-1">{rangeLabel}</p>
          </CardContent>
        </Card>
      </div>

      {/* Comprehensive Reports with Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        {/* Mobile: Scrollable horizontal tabs */}
        <div className="md:hidden">
          <TabsList className="flex w-full overflow-x-auto space-x-1 p-1">
            <TabsTrigger value="overview" className="flex-shrink-0 text-xs px-3 py-2">Overview</TabsTrigger>
            <TabsTrigger value="daily" className="flex-shrink-0 text-xs px-3 py-2">Daily</TabsTrigger>
            <TabsTrigger value="trends" className="flex-shrink-0 text-xs px-3 py-2">Trends</TabsTrigger>
            <TabsTrigger value="merchants" className="flex-shrink-0 text-xs px-3 py-2">Merchants</TabsTrigger>
            <TabsTrigger value="categories" className="flex-shrink-0 text-xs px-3 py-2">Categories</TabsTrigger>
          </TabsList>
        </div>
        
        {/* Desktop: Grid layout */}
        <div className="hidden md:block">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="daily">Daily Activity</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="merchants">Top Merchants</TabsTrigger>
            <TabsTrigger value="categories">Category Analysis</TabsTrigger>
          </TabsList>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Category Breakdown */}
          <div className="glass-card p-4 md:p-8 rounded-2xl animate-fade-in-up">
            <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Spending by Category</h2>
            <div className="flex flex-col lg:flex-row items-center gap-8">
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    dataKey="value"
                    label={({ name, percentage }) => `${name} ${percentage.toFixed(0)}%`}
                  >
                    {categoryBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                    }}
                    formatter={(value: any) => [formatAmount(value), 'Amount']}
                  />
                </PieChart>
              </ResponsiveContainer>
              
              <div className="space-y-3 w-full lg:w-auto min-w-[300px]">
                {categoryBreakdown.map((category, index) => (
                  <div key={category.name} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{category.name}</span>
                      <p className="text-xs text-muted-foreground">{category.count} transactions</p>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold">{formatAmount(category.amount)}</span>
                      <p className="text-xs text-muted-foreground">{category.percentage.toFixed(1)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Net Worth Card */}
          <div className="glass-card p-4 md:p-8 rounded-2xl">
            <h2 className="text-xl md:text-2xl font-bold mb-4">Net Worth</h2>
            <div className="text-2xl md:text-4xl font-bold text-emerald-600">{formatAmount(netWorth)}</div>
            <p className="text-sm text-muted-foreground mt-2">Total across all open accounts</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(accounts || []).filter(a => !a.closed).map(acc => (
                <div key={acc.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <span className="text-sm truncate mr-3" title={acc.name}>{acc.name}</span>
                  <span className={`text-sm font-semibold ${ (acc.balance || 0) < 0 ? 'text-red-600' : 'text-emerald-600' }`}>
                    {formatAmount(typeof acc.balance === 'number' ? acc.balance : (balancesFromTxMap.get(acc.id) || 0))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Daily Activity Tab */}
        <TabsContent value="daily" className="space-y-6">
          <div className="glass-card p-4 md:p-8 rounded-2xl">
            <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Daily Transaction Activity ({rangeLabel})</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={dailyTransactionData}>
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                  }}
                />
                <Legend />
                <Bar dataKey="transactions" fill={neutralColor} name="Total Transactions" />
                <Bar dataKey="expenses" fill={expenseColor} name="Expense Transactions" />
                <Bar dataKey="income" fill={incomeColor} name="Income Transactions" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card p-4 md:p-8 rounded-2xl">
            <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Daily Spending Amount</h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyTransactionData}>
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                  }}
                  formatter={(value: any) => [formatAmount(value), 'Amount Spent']}
                />
                <Area type="monotone" dataKey="amount" stroke={colors[0]} fill={colors[0]} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-6">
          <div className="glass-card p-4 md:p-8 rounded-2xl">
            <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Monthly Income vs Expenses (Last 12 Months)</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={monthlyTrendData}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                  }}
                  formatter={(value: any) => formatAmount(value)}
                />
                <Legend />
                <Bar dataKey="income" fill={incomeColor} name="Income" />
                <Bar dataKey="expenses" fill={expenseColor} name="Expenses" />
                <Bar dataKey="net" fill={neutralColor} name="Net" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        {/* Top Merchants Tab */}
        <TabsContent value="merchants" className="space-y-6">
          <div className="glass-card p-4 md:p-8 rounded-2xl">
            <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Top Merchants by Spending</h2>
            <div className="space-y-4">
              {topPayees.map((payee, index) => (
                <div key={payee.name} className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{payee.name}</h3>
                    <p className="text-sm text-muted-foreground">{payee.count} transactions</p>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg">{formatAmount(payee.amount)}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatAmount(payee.amount / payee.count)} avg
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Category Analysis Tab */}
        <TabsContent value="categories" className="space-y-6">
          <div className="glass-card p-4 md:p-8 rounded-2xl">
            <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Category Spending Trends (Last 6 Months)</h2>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={categoryTrendData}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                  }}
                  formatter={(value: any) => formatAmount(value)}
                />
                <Legend />
                {categoryBreakdown.slice(0, 5).map((category, index) => (
                  <Line
                    key={category.name}
                    type="monotone"
                    dataKey={category.name}
                    stroke={colors[index % colors.length]}
                    strokeWidth={3}
                    dot={{ fill: colors[index % colors.length], strokeWidth: 2, r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
