import type { HybridAccount, HybridTransaction } from '@/lib/hybrid-api';
import { HybridAPI } from '@/lib/hybrid-api';
import { toast } from 'sonner';

// Local storage keys
const DEMO_KEY = 'evercash_demo_mode';
const DATA_KEY = 'evercash_demo_overlay_data_v1';

interface DemoDataShape {
  accounts: HybridAccount[];
  transactions: HybridTransaction[];
  categories: { id: string; name: string; is_income?: boolean }[];
}

// deterministic pseudo-random based on index
function drand(i: number, min: number, max: number) {
  const x = Math.sin(i * 9999) * 10000; // stable across sessions
  const f = x - Math.floor(x);
  return Math.round((f * (max - min) + min) * 100) / 100;
}
function todayISO() { return new Date().toISOString().slice(0,10); }
function addDays(d: Date, days: number) { const x = new Date(d); x.setDate(x.getDate() + days); return x; }

function buildDefaultData(): DemoDataShape {
  const accounts: HybridAccount[] = [
    { id: 'demo-acc-1', name: 'Demo Checking', type: 'checking', balance: 42000, closed: false, offbudget: false },
    { id: 'demo-acc-2', name: 'Demo Savings', type: 'savings', balance: 125000, closed: false, offbudget: false },
    { id: 'demo-acc-3', name: 'Demo Credit Card', type: 'credit', balance: -12000, closed: false, offbudget: false },
  ];

  const categories = [
    { id: 'cat-income-salary', name: 'Salary', is_income: true },
    { id: 'cat-food', name: 'Food & Dining' },
    { id: 'cat-shopping', name: 'Shopping' },
    { id: 'cat-transport', name: 'Transportation' },
    { id: 'cat-bills', name: 'Bills & Utilities' },
    { id: 'cat-entertainment', name: 'Entertainment' },
    { id: 'cat-other', name: 'Other' },
  ];

  const baseDate = addDays(new Date(), -59);
  const tx: HybridTransaction[] = [];

  // Salary once a month (fixed)
  for (let m = 0; m < 2; m++) {
    const dt = addDays(baseDate, 5 + 30*m).toISOString().slice(0,10);
    tx.push({ id: crypto.randomUUID(), account: 'demo-acc-1', amount: 32000, date: dt, notes: 'DEMO overlay: salary', payee: 'ACME Corp', category: 'Salary', cleared: true });
  }

  // Random daily expenses over last 60 days
  for (let i = 0; i < 60; i++) {
    const dISO = addDays(baseDate, i).toISOString().slice(0,10);
    if (i % 5 === 0) tx.push({ id: crypto.randomUUID(), account: 'demo-acc-1', amount: -drand(i, 200, 600), date: dISO, notes: 'DEMO overlay', payee: 'Groceries', category: 'Food & Dining', cleared: true });
    if (i % 3 === 0) tx.push({ id: crypto.randomUUID(), account: 'demo-acc-1', amount: -drand(i, 80, 200), date: dISO, notes: 'DEMO overlay', payee: 'Coffee Shop', category: 'Food & Dining', cleared: true });
    if (i % 7 === 0) tx.push({ id: crypto.randomUUID(), account: 'demo-acc-1', amount: -drand(i, 300, 900), date: dISO, notes: 'DEMO overlay', payee: 'Uber', category: 'Transportation', cleared: true });
    if (i % 9 === 0) tx.push({ id: crypto.randomUUID(), account: 'demo-acc-1', amount: -drand(i, 400, 2000), date: dISO, notes: 'DEMO overlay', payee: 'Amazon', category: 'Shopping', cleared: false });
  }
  // Bills
  tx.push({ id: crypto.randomUUID(), account: 'demo-acc-1', amount: -1299, date: addDays(baseDate, 45).toISOString().slice(0,10), notes: 'DEMO overlay', payee: 'Electric Utility', category: 'Bills & Utilities', cleared: true });
  tx.push({ id: crypto.randomUUID(), account: 'demo-acc-1', amount: -799, date: addDays(baseDate, 35).toISOString().slice(0,10), notes: 'DEMO overlay', payee: 'Streaming', category: 'Entertainment', cleared: true });

  return { accounts, transactions: tx, categories };
}

function loadData(): DemoDataShape {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const d = buildDefaultData();
  try { localStorage.setItem(DATA_KEY, JSON.stringify(d)); } catch {}
  return d;
}

function saveData(d: DemoDataShape) {
  try { localStorage.setItem(DATA_KEY, JSON.stringify(d)); } catch {}
}

export function isDemoOverlayEnabled(): boolean {
  try { return localStorage.getItem(DEMO_KEY) === 'true'; } catch { return false; }
}

export function setDemoOverlayEnabled(v: boolean) {
  try { localStorage.setItem(DEMO_KEY, v ? 'true' : 'false'); } catch {}
}

export function resetDemoOverlayData(): void {
  const d = buildDefaultData();
  try { localStorage.setItem(DATA_KEY, JSON.stringify(d)); } catch {}
}

export function createDemoOverlayAPI(base: HybridAPI): HybridAPI {
  const store = loadData();

  function notifyBlocked(action: string) {
    toast.info(`Demo mode: ${action} are disabled.`, {
      action: {
        label: 'Exit demo',
        onClick: () => { try { setDemoOverlayEnabled(false); } catch {} window.location.reload(); }
      },
      duration: 3500,
    });
  }

  function rejectBlocked<T>(action: string): Promise<T> {
    notifyBlocked(action);
    return Promise.reject(new Error('DEMO_MODE_BLOCKED')) as Promise<T>;
  }

  const apiLike: any = {
    // Fast getters
    async getAccounts() {
      return store.accounts;
    },
    async getTransactions(accountId?: string) {
      const all = store.transactions.slice().sort((a,b) => (a.date < b.date ? 1 : -1));
      return accountId ? all.filter(t => t.account === accountId) : all;
    },
    async getCategories() {
      return store.categories.map(c => ({ id: c.id, name: c.name, is_income: !!c.is_income }));
    },
    async getPayees() {
      const names = Array.from(new Set(store.transactions.map(t => t.payee).filter(Boolean))) as string[];
      return names.map((name, idx) => ({ id: `payee-${idx}`, name }));
    },
    async getBudgetMonth(month: string) {
      // Compute simple budget summary from mock tx
      const monthTx = store.transactions.filter(t => t.date.startsWith(month));
      const categories = await apiLike.getCategories();
      const expenseCats = categories.filter((c: any) => !c.is_income);
      const incomeCats = categories.filter((c: any) => c.is_income);

      const budgetMap = new Map<string, number>();
      expenseCats.forEach((c: any) => budgetMap.set(c.id, 5000));

      const catIdByName = new Map<string, string>();
      categories.forEach((c: any) => catIdByName.set(c.name, c.id));

      const group = (names: string[]) => names.map(n => {
        const id = catIdByName.get(n)!;
        const spent = monthTx.filter(t => t.amount < 0 && (t.category === n || t.category === id))
                             .reduce((s, t) => s + Math.abs(t.amount), 0);
        const budgeted = budgetMap.get(id) || 0;
        return { id, name: n, budgeted, spent, balance: budgeted - spent };
      });

      const out = {
        month,
        categoryGroups: [
          { id: 'living-expenses', name: 'Living Expenses', is_income: false, categories: group(['Food & Dining','Shopping','Transportation','Bills & Utilities']) },
          { id: 'lifestyle', name: 'Lifestyle', is_income: false, categories: group(['Entertainment']) },
          { id: 'income', name: 'Income', is_income: true, categories: incomeCats.map((c: any) => ({ ...c, budgeted: 0, spent: 0, balance: 0 })) },
        ],
        accounts: store.accounts,
        transactions: monthTx,
        totalBudgeted: 5000 * expenseCats.length,
        totalSpent: monthTx.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
        totalIncome: monthTx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
        toBudget: 0,
      };
      return out;
    },
    async generateReport(type: string, params: any) {
      const tx = store.transactions;
      const inRange = (t: HybridTransaction) => {
        if (!params?.startDate || !params?.endDate) return true;
        const d = t.date;
        return d >= params.startDate && d <= params.endDate;
      };
      if (type === 'spending') {
        const filtered = tx.filter(t => t.amount < 0 && inRange(t));
        const total = filtered.reduce((s, t) => s + Math.abs(t.amount), 0);
        return { data: filtered, summary: { total, count: filtered.length } };
      }
      if (type === 'income') {
        const filtered = tx.filter(t => t.amount > 0 && inRange(t));
        const total = filtered.reduce((s, t) => s + t.amount, 0);
        return { data: filtered, summary: { total, count: filtered.length } };
      }
      return { data: [], summary: {} };
    },

    // Block all mutating operations in demo mode
    async addTransaction(_tx: Partial<HybridTransaction>): Promise<string> {
      return rejectBlocked<string>('adding transactions');
    },
    async updateTransaction(_id: string, _updates: Partial<HybridTransaction>): Promise<void> {
      return rejectBlocked<void>('editing transactions');
    },
    async deleteTransaction(_id: string): Promise<void> {
      return rejectBlocked<void>('deleting transactions');
    },
    async deleteAllTransactions(): Promise<void> {
      return rejectBlocked<void>('deleting transactions');
    },
    async importTransactions(_accountId: string, _file: File): Promise<{ imported: number }> {
      return rejectBlocked<{ imported: number }>('importing transactions');
    },
    async createAccount(_a: Partial<HybridAccount>): Promise<string> {
      return rejectBlocked<string>('creating accounts');
    },
    async updateAccount(_id: string, _updates: Partial<HybridAccount>): Promise<void> {
      return rejectBlocked<void>('editing accounts');
    },
    async deleteAccount(_id: string): Promise<void> {
      return rejectBlocked<void>('deleting accounts');
    },
    async createCategory(_category: any): Promise<string> {
      return rejectBlocked<string>('creating categories');
    },
    async setBudgetAmount(_month: string, _categoryId: string, _amountCents: number): Promise<any> {
      return rejectBlocked<any>('changing budgets');
    },
    async createGoal(_goalData: any): Promise<any> {
      return rejectBlocked<any>('creating goals');
    },
    async updateGoal(_goalId: string, _updates: any): Promise<any> {
      return rejectBlocked<any>('editing goals');
    },
    async deleteGoal(_goalId: string): Promise<void> {
      return rejectBlocked<void>('deleting goals');
    },
    async createRazorpayOrder(_amount: number, _currency?: string, _notes?: any): Promise<any> {
      return rejectBlocked<any>('payments');
    },
    async verifyRazorpayPayment(_payload: any): Promise<any> {
      return rejectBlocked<any>('payments');
    },
  };

  // Fallback to base for any method we didn't override
  const handler: any = new Proxy(base as any, {
    get(target, prop, receiver) {
      if (prop in apiLike) return (apiLike as any)[prop];
      const v = (target as any)[prop];
      if (typeof v === 'function') return v.bind(target);
      return v;
    }
  });

  return handler as unknown as HybridAPI;
}
