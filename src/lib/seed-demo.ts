import { HybridAPI } from '@/lib/hybrid-api';

export interface DemoStats {
  netWorth: number;
  txCount: number;
}

export async function seedDemoData(api: HybridAPI, opts?: { force?: boolean }): Promise<DemoStats> {
  // Check current data
  const [accounts, transactions, categories] = await Promise.all([
    api.getAccounts(),
    api.getTransactions(),
    api.getCategories(),
  ]);

  // Only seed if user has virtually no data
  if (!opts?.force && (transactions?.length || 0) > 0) {
    return {
      netWorth: (accounts || []).reduce((s, a: any) => s + (a.balance || 0), 0),
      txCount: transactions.length,
    };
  }

  // Ensure required categories exist (by name)
  const ensureCategory = async (name: string, is_income = false) => {
    const existing = (categories || []).find((c: any) => c?.name === name);
    if (existing) return existing.id;
    try {
      const id = await api.createCategory({ name, is_income, sort_order: 0 });
      return id;
    } catch {
      // Fallback: if backend rejects create, return null
      return null as any;
    }
  };

  const catFood = await ensureCategory('Food & Dining');
  const catShopping = await ensureCategory('Shopping');
  const catTransport = await ensureCategory('Transportation');
  const catEntertainment = await ensureCategory('Entertainment');
  const catBills = await ensureCategory('Bills & Utilities');
  const catIncome = await ensureCategory('Salary', true);

  // Create demo accounts
  const demoCheckingId = await api.createAccount({ name: 'Demo Checking', type: 'checking', balance: 4200, closed: false });
  const demoSavingsId = await api.createAccount({ name: 'Demo Savings', type: 'savings', balance: 12500, closed: false });
  const demoCardId = await api.createAccount({ name: 'Demo Credit Card', type: 'credit', balance: -1200, closed: false });

  // Build demo transactions (last 30 days)
  const today = new Date();
  const days = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    return d.toISOString().slice(0, 10);
  });

  const rand = (min: number, max: number) => Math.round((Math.random() * (max - min) + min) * 100) / 100;

  const txns: any[] = [];

  // Income once
  txns.push({
    account: demoCheckingId,
    amount: 3200,
    date: days[25] || today.toISOString().slice(0, 10),
    notes: 'DEMO: Monthly salary',
    payee: 'ACME Corp',
    category: catIncome || 'Salary',
    cleared: true,
  });

  // Recurring small expenses
  days.forEach((iso, idx) => {
    if (idx % 7 === 0) {
      txns.push({ account: demoCheckingId, amount: -rand(40, 80), date: iso, payee: 'Groceries', category: catFood || 'Food & Dining', notes: 'DEMO: seed', cleared: true });
    }
    if (idx % 5 === 0) {
      txns.push({ account: demoCheckingId, amount: -rand(8, 18), date: iso, payee: 'Coffee Shop', category: catFood || 'Food & Dining', notes: 'DEMO: seed', cleared: true });
    }
    if (idx % 6 === 0) {
      txns.push({ account: demoCheckingId, amount: -rand(25, 60), date: iso, payee: 'Uber', category: catTransport || 'Transportation', notes: 'DEMO: seed', cleared: true });
    }
    if (idx % 9 === 0) {
      txns.push({ account: demoCheckingId, amount: -rand(30, 120), date: iso, payee: 'Amazon', category: catShopping || 'Shopping', notes: 'DEMO: seed', cleared: false });
    }
  });

  // One-time bills and entertainment
  txns.push({ account: demoCheckingId, amount: -89.99, date: days[10] || today.toISOString().slice(0,10), payee: 'Electric Utility', category: catBills || 'Bills & Utilities', notes: 'DEMO: seed', cleared: true });
  txns.push({ account: demoCheckingId, amount: -59.99, date: days[15] || today.toISOString().slice(0,10), payee: 'Streaming Service', category: catEntertainment || 'Entertainment', notes: 'DEMO: seed', cleared: true });

  await api.addTransactions(demoCheckingId, txns);

  const refreshedAccounts = await api.getAccounts();
  const refreshedTransactions = await api.getTransactions();
  const netWorth = (refreshedAccounts || []).reduce((s: number, a: any) => s + (a.balance || 0), 0);

  return { netWorth, txCount: refreshedTransactions.length };
}

export async function clearDemoData(api: HybridAPI): Promise<void> {
  try {
    const tx = await api.getTransactions();
    for (const t of tx) {
      if ((t.notes || '').toString().startsWith('DEMO')) {
        await api.deleteTransaction(t.id);
      }
    }
  } catch {}
  try {
    const accs = await api.getAccounts();
    for (const a of accs) {
      if ((a.name || '').toString().startsWith('Demo ')) {
        await api.deleteAccount(a.id);
      }
    }
  } catch {}
}
