// Hybrid API: Actual Budget functions + Supabase storage
import { initAPI, getAPI, type ActualAPI } from '@/lib/api';
import { SupabaseAPI, initSupabaseAPI } from '@/lib/supabase-api';

export interface HybridAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
  closed: boolean;
  offbudget: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface HybridTransaction {
  id: string;
  account: string;
  amount: number;
  date: string;
  notes?: string;
  payee?: string;
  category?: string;
  cleared: boolean;
  imported?: boolean;
  created_at?: string;
}

export class HybridAPI {
  private actualAPI: ActualAPI;
  private supabaseAPI: SupabaseAPI;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.supabaseAPI = initSupabaseAPI(baseUrl);
  }

  // User credits & premium status
  async getImportCredits(): Promise<{ is_premium: boolean; import_credits_total: number; import_credits_used: number; }> {
    return await this.supabaseAPI.getImportCredits();
  }

  async initialize(): Promise<void> {
    try {
      // Initialize Actual Budget API for business logic (optional)
      // If this fails, we'll just use Supabase for everything
      this.actualAPI = await initAPI({
        baseUrl: this.baseUrl,
        token: localStorage.getItem('actual-token') || undefined
      });
      console.log('✅ Actual Budget API initialized for calculations');
    } catch (error) {
      console.warn('⚠️ Actual Budget API not available, using Supabase only:', error);
      // Continue without Actual Budget API - we'll do calculations in frontend
    }
  }

  // Authentication - use Supabase
  async login(password: string): Promise<{ token: string }> {
    return await this.supabaseAPI.login(password);
  }

  async getServerVersion(): Promise<string> {
    return await this.supabaseAPI.getServerVersion();
  }

  // Accounts - Store in Supabase, use Actual Budget for calculations
  async getAccounts(): Promise<HybridAccount[]> {
    try {
      const supabaseAccounts = await this.supabaseAPI.getAccounts();
      
      // Convert to Actual Budget format for calculations
      const hybridAccounts: HybridAccount[] = supabaseAccounts.map(acc => ({
        id: acc.id,
        name: acc.name,
        type: acc.type,
        balance: acc.balance,
        closed: acc.closed,
        offbudget: false, // Default for compatibility
        created_at: acc.created_at,
        updated_at: acc.updated_at,
      }));

      return hybridAccounts;
    } catch (error) {
      console.error('Failed to get accounts:', error);
      throw error;
    }
  }

  async createAccount(account: Partial<HybridAccount>): Promise<string> {
    try {
      console.log('🏦 Creating account via hybrid API:', account);
      
      // Store in Supabase
      const accountId = await this.supabaseAPI.createAccount({
        name: account.name,
        type: account.type,
        balance: account.balance,
        closed: account.closed || false,
      });

      console.log('✅ Account created in Supabase:', accountId);
      return accountId;
    } catch (error) {
      console.error('❌ Failed to create account:', error);
      throw error;
    }
  }

  async updateAccount(id: string, updates: Partial<HybridAccount>): Promise<void> {
    await this.supabaseAPI.updateAccount(id, {
      name: updates.name,
      type: updates.type,
      balance: updates.balance,
      closed: updates.closed,
    });
  }

  async deleteAccount(id: string): Promise<void> {
    // For now, just close the account instead of deleting
    await this.updateAccount(id, { closed: true });
  }

  async closeAccount(id: string): Promise<void> {
    await this.updateAccount(id, { closed: true });
  }

  async reopenAccount(id: string): Promise<void> {
    await this.updateAccount(id, { closed: false });
  }

  // Transactions - Store in Supabase, use Actual Budget for calculations
  async getTransactions(accountId?: string): Promise<HybridTransaction[]> {
    try {
      const supabaseTransactions = await this.supabaseAPI.getTransactions(accountId); console.log(' Raw Supabase transactions:', supabaseTransactions.slice(0, 2));
      
      // Convert to hybrid format
      const hybridTransactions: HybridTransaction[] = supabaseTransactions.map(txn => ({
        id: txn.id,
        account: txn.account_id,
        amount: txn.amount,
        date: txn.date,
        notes: txn.notes,
        payee: (txn as any).payees?.name || (txn as any).payee || txn.payee_id,
        category: (txn as any).categories?.name || (txn as any).category || txn.category_id,
        cleared: txn.cleared,
        imported: txn.imported,
        created_at: txn.created_at,
      }));

      return hybridTransactions;
    } catch (error) {
      console.error('Failed to get transactions:', error);
      throw error;
    }
  }

  async addTransaction(transaction: Partial<HybridTransaction>): Promise<string> {
    return await this.supabaseAPI.createTransaction({
      account_id: transaction.account || (transaction as any).accountId,
      amount: transaction.amount!,
      date: transaction.date!,
      notes: transaction.notes,
      payee: transaction.payee, // Pass as string, will be converted to UUID in backend
      category: transaction.category, // Pass as string, will be converted to UUID in backend
      cleared: transaction.cleared || false,
      imported: transaction.imported || false,
    });
  }

  async addTransactions(accountId: string, transactions: Partial<HybridTransaction>[]): Promise<string[]> {
    const results: string[] = [];
    for (const txn of transactions) {
      // Set the account for each transaction
      const transactionWithAccount = { ...txn, account: accountId };
      const id = await this.addTransaction(transactionWithAccount);
      results.push(id);
    }
    return results;
  }

  async updateTransaction(transactionId: string, updates: Partial<HybridTransaction>): Promise<void> {
    // Build update object with only provided fields
    const updateData: any = {};
    
    if (updates.amount !== undefined) updateData.amount = updates.amount;
    if (updates.date !== undefined) updateData.date = updates.date;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.payee !== undefined) updateData.payee = updates.payee;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.cleared !== undefined) updateData.cleared = updates.cleared;
    
    await this.supabaseAPI.updateTransaction(transactionId, updateData);
  }

  async deleteTransaction(transactionId: string): Promise<void> {
    await this.supabaseAPI.deleteTransaction(transactionId);
  }

  async deleteAllTransactions(): Promise<void> {
    await this.supabaseAPI.deleteAllTransactions();
  }

  async createRazorpayOrder(amount: number, currency: string = 'INR', notes?: any): Promise<{ order_id: string; amount: number; currency: string; key_id: string; }> {
    return await this.supabaseAPI.createRazorpayOrder(amount, currency, notes);
  }

  async verifyRazorpayPayment(payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string; }): Promise<void> {
    await this.supabaseAPI.verifyRazorpayPayment(payload);
  }

  // Categories - Store in Supabase, use Actual Budget for grouping logic
  async getCategories(): Promise<any[]> {
    const categories = await this.supabaseAPI.getCategories();
    // Filter out categories with UUID names (corrupted data)
    const validCategories = categories.filter(cat => 
      cat.name && !cat.name.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    );
    console.log('📋 Filtered categories:', validCategories.length, 'out of', categories.length);
    return validCategories;
  }

  async createCategory(category: any): Promise<string> {
    return await this.supabaseAPI.createCategory(category);
  }

  async setBudgetAmount(month: string, categoryId: string, amountCents: number): Promise<any> {
    console.log('Setting budget amount:', { month, categoryId, amountCents });
    return await this.supabaseAPI.setBudgetAmount(categoryId, month, amountCents);
  }

  // Goals - Store in Supabase
  async getGoals(): Promise<any[]> {
    return await this.supabaseAPI.getGoals();
  }

  async createGoal(goalData: any): Promise<any> {
    return await this.supabaseAPI.createGoal(goalData);
  }

  async updateGoal(goalId: string, updates: any): Promise<any> {
    return await this.supabaseAPI.updateGoal(goalId, updates);
  }

  async deleteGoal(goalId: string): Promise<void> {
    return await this.supabaseAPI.deleteGoal(goalId);
  }

  // Payees - Store in Supabase
  async getPayees(): Promise<any[]> {
    return await this.supabaseAPI.getPayees();
  }

  // Budget calculations - Use Actual Budget logic with Supabase data
  async getBudgetMonth(month: string): Promise<any> {
    try {
      // Get data from Supabase
      const [accounts, transactions, categories, budgetAmounts] = await Promise.all([
        this.getAccounts(),
        this.getTransactions(),
        this.getCategories(),
        this.supabaseAPI.getBudgetAmounts(month)
      ]);

      // Group categories by type and create category groups
      const expenseCategories = categories.filter(c => !c.is_income);
      const incomeCategories = categories.filter(c => c.is_income);
      
      // Create budget lookup map
      const budgetMap = new Map();
      budgetAmounts.forEach(budget => {
        budgetMap.set(budget.category_id, budget.amount); // Keep in cents for display consistency
      });

      // Create category groups structure expected by Budgets page
      const categoryGroups = [
        {
          id: 'living-expenses',
          name: 'Living Expenses',
          is_income: false,
          categories: expenseCategories.filter(c => 
            ['Food & Dining', 'Shopping', 'Transportation', 'Bills & Utilities'].includes(c.name)
          ).map(cat => {
            const budgeted = budgetMap.get(cat.id) || 0;
            return {
              ...cat,
              budgeted: budgeted,
              spent: 0,
              balance: budgeted,
            };
          })
        },
        {
          id: 'lifestyle',
          name: 'Lifestyle',
          is_income: false,
          categories: expenseCategories.filter(c => 
            ['Entertainment', 'Travel', 'Personal Care', 'Healthcare'].includes(c.name)
          ).map(cat => {
            const budgeted = budgetMap.get(cat.id) || 0;
            return {
              ...cat,
              budgeted: budgeted,
              spent: 0,
              balance: budgeted,
            };
          })
        },
        {
          id: 'other-expenses',
          name: 'Other Expenses',
          is_income: false,
          categories: expenseCategories.filter(c => 
            !['Food & Dining', 'Shopping', 'Transportation', 'Bills & Utilities', 
              'Entertainment', 'Travel', 'Personal Care', 'Healthcare'].includes(c.name)
          ).map(cat => {
            const budgeted = budgetMap.get(cat.id) || 0;
            return {
              ...cat,
              budgeted: budgeted,
              spent: 0,
              balance: budgeted,
            };
          })
        },
        {
          id: 'income',
          name: 'Income',
          is_income: true,
          categories: incomeCategories.map(cat => {
            const budgeted = budgetMap.get(cat.id) || 0;
            return {
              ...cat,
              budgeted: budgeted,
              spent: 0,
              balance: budgeted,
            };
          })
        }
      ].filter(group => group.categories.length > 0); // Only include groups with categories

      // Compute per-category spent from monthly transactions
      const monthTx = (transactions || []).filter(t => t.date && t.date.startsWith(month));
      const monthlyIncome = monthTx.filter(t => (t.amount || 0) > 0).reduce((sum, t) => sum + (t.amount || 0), 0);
      const monthlyExpenses = monthTx.filter(t => (t.amount || 0) < 0).reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

      const catNameById = new Map<string, string>();
      const catIdByName = new Map<string, string>();
      categories.forEach(c => {
        catNameById.set(c.id, c.name);
        catIdByName.set(c.name, c.id);
      });

      // Helper to check if transaction matches a category
      const matchesCategory = (txCat: any, cat: any) => {
        return txCat === cat.id || txCat === cat.name || (typeof txCat === 'string' && catIdByName.get(txCat) === cat.id);
      };

      categoryGroups.forEach(group => {
        group.categories.forEach(category => {
          // Sum expenses for this category in the month
          const spent = monthTx
            .filter(t => (t.amount || 0) < 0 && matchesCategory(t.category, category))
            .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
          category.spent = spent;
          category.balance = (category.budgeted || 0) - spent;
        });
      });

      // Calculate budget summary totals
      const totalBudgeted = categoryGroups
        .filter(g => !g.is_income)
        .reduce((sum, g) => sum + g.categories.reduce((s, c) => s + (c.budgeted || 0), 0), 0);
      const totalSpent = monthlyExpenses;
      const totalIncome = monthlyIncome;
      const toBudget = totalIncome - totalBudgeted;

      return {
        month,
        categoryGroups,
        accounts,
        transactions: monthTx,
        totalBudgeted,
        totalSpent,
        totalIncome,
        toBudget,
      };
    } catch (error) {
      console.error('Failed to get budget month:', error);
      return {
        month,
        categoryGroups: [],
        accounts: [],
        transactions: [],
        totalBudgeted: 0,
        totalSpent: 0,
        totalIncome: 0,
        toBudget: 0,
      };
    }
  }

  // CSV Import - Store in Supabase
  async importTransactions(accountId: string, file: File): Promise<{ imported: number }> {
    return await this.supabaseAPI.importTransactions(accountId, file);
  }

  // Reports - Use Actual Budget calculations with Supabase data
  async generateReport(type: string, params: any): Promise<any> {
    const transactions = await this.getTransactions();
    const accounts = await this.getAccounts();
    
    // Apply Actual Budget's report logic here
    switch (type) {
      case 'spending':
        return this.calculateSpendingReport(transactions, params);
      case 'income':
        return this.calculateIncomeReport(transactions, params);
      default:
        return { data: [], summary: {} };
    }
  }

  private calculateSpendingReport(transactions: HybridTransaction[], params: any): any {
    // Implement Actual Budget's spending calculation logic
    const filtered = transactions.filter(t => 
      t.amount < 0 && // Expenses only
      new Date(t.date) >= new Date(params.startDate) &&
      new Date(t.date) <= new Date(params.endDate)
    );

    const total = filtered.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    return {
      data: filtered,
      summary: { total, count: filtered.length },
    };
  }

  private calculateIncomeReport(transactions: HybridTransaction[], params: any): any {
    // Implement Actual Budget's income calculation logic
    const filtered = transactions.filter(t => 
      t.amount > 0 && // Income only
      new Date(t.date) >= new Date(params.startDate) &&
      new Date(t.date) <= new Date(params.endDate)
    );

    const total = filtered.reduce((sum, t) => sum + t.amount, 0);
    
    return {
      data: filtered,
      summary: { total, count: filtered.length },
    };
  }
}

// Global instance
let hybridApiInstance: HybridAPI | null = null;

export async function initHybridAPI(baseUrl: string): Promise<HybridAPI> {
  hybridApiInstance = new HybridAPI(baseUrl);
  await hybridApiInstance.initialize();
  return hybridApiInstance;
}

export function getHybridAPI(): HybridAPI {
  if (!hybridApiInstance) {
    throw new Error('Hybrid API not initialized');
  }
  return hybridApiInstance;
}
