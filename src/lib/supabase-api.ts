// Supabase-compatible API client for EVERCASH
export interface SupabaseAccount {
  id: string;
  name: string;
  type: string;
  balance: number; // in cents
  closed: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SupabaseTransaction {
  id: string;
  account_id: string;
  amount: number; // in cents
  date: string;
  notes?: string;
  payee_id?: string;
  category_id?: string;
  cleared: boolean;
  imported: boolean;
  created_at?: string;
}

export interface SupabaseCategory {
  id: string;
  name: string;
  cat_group?: string;
  is_income: boolean;
  sort_order: number;
}

export interface SupabasePayee {
  id: string;
  name: string;
}

export class SupabaseAPI {
  private baseUrl: string;
  private token: string | null = null;
  // Simple in-memory TTL cache
  private cache = new Map<string, { value: any; expires: number }>();
  private cacheTTL = Number((import.meta as any)?.env?.VITE_CACHE_TTL_MS || 180000); // default 3 minutes
  private pending = new Map<string, Promise<any>>();
  private DEBUG = (import.meta as any)?.env?.VITE_DEBUG_LOGS === 'true';

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    // Don't get token in constructor, get it fresh each time
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    // console.log(`🟢 Cache hit: ${key}`);
    return entry.value as T;
  }

  private setCache<T>(key: string, value: T, ttlMs?: number) {
    const ttl = typeof ttlMs === 'number' ? ttlMs : this.cacheTTL;
    this.cache.set(key, { value, expires: Date.now() + Math.max(1000, ttl) });
  }

  private invalidateCache(prefixes: string | string[]) {
    const list = Array.isArray(prefixes) ? prefixes : [prefixes];
    for (const key of Array.from(this.cache.keys())) {
      if (list.some(prefix => key.startsWith(prefix))) {
        this.cache.delete(key);
      }
    }
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    // Get fresh token each time
    const token = localStorage.getItem('actual-token');
    if (this.DEBUG) console.log('🔑 Token from localStorage:', token ? `${token.substring(0, 20)}...` : 'null');
    const isJwt = !!token && /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token);
    if (isJwt && token) {
      headers['Authorization'] = `Bearer ${token}`;
      if (this.DEBUG) console.log('🔐 Authorization header set:', `Bearer ${token.substring(0, 20)}...`);
    } else if (token) {
      if (this.DEBUG) console.warn('⚠️ Ignoring malformed token (not a JWT)');
    } else {
      if (this.DEBUG) console.warn('⚠️ No token found in localStorage!');
    }

    // If sending FormData, let the browser set the correct multipart boundary
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (isFormData) {
      delete headers['Content-Type'];
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      throw new Error(`API Error (${response.status}): ${JSON.stringify(errorData)}`);
    }

    const data = await response.text();
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  // Authentication
  async login(password: string): Promise<{ token: string }> {
    const response = await this.request('/account/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });

    if (response.status === 'ok' && response.data.token) {
      this.token = response.data.token;
      localStorage.setItem('actual-token', this.token);
      return { token: this.token };
    }

    throw new Error('Login failed');
  }

  // Server info
  async getServerVersion(): Promise<string> {
    const response = await this.request('/');
    return response.version || '2.0.0';
  }

  // Accounts
  async getAccounts(): Promise<SupabaseAccount[]> {
    const cacheKey = 'accounts';
    const cached = this.getFromCache<SupabaseAccount[]>(cacheKey);
    if (cached) return cached;
    if (this.pending.has(cacheKey)) return await this.pending.get(cacheKey);
    const promise = (async () => {
      try {
        const accounts = await this.request('/accounts');
        const mapped = accounts.map((acc: any) => ({
          ...acc,
          balance: acc.balance / 100, // Convert from cents to dollars
        }));
        if (Array.isArray(mapped) && mapped.length > 0) {
          this.setCache(cacheKey, mapped);
        }
        return mapped as SupabaseAccount[];
      } finally {
        this.pending.delete(cacheKey);
      }
    })();
    this.pending.set(cacheKey, promise);
    return await promise;
  }

  async createAccount(account: Partial<SupabaseAccount>): Promise<string> {
    const response = await this.request('/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: account.name || 'New Account',
        type: account.type || 'checking',
        balance: Math.round((account.balance || 0) * 100), // Convert to cents
        closed: account.closed || false,
      }),
    });
    this.invalidateCache(['accounts']);
    return response.data.id;
  }

  async updateAccount(id: string, updates: Partial<SupabaseAccount>): Promise<void> {
    await this.request(`/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...updates,
        balance: updates.balance !== undefined ? Math.round(updates.balance * 100) : undefined,
      }),
    });
    this.invalidateCache(['accounts']);
  }

  async deleteAccount(id: string): Promise<void> {
    await this.request(`/accounts/${id}`, {
      method: 'DELETE',
    });
    this.invalidateCache(['accounts', `transactions:account:${id}`]);
  }

  async closeAccount(id: string): Promise<void> {
    await this.updateAccount(id, { closed: true });
    this.invalidateCache(['accounts']);
  }

  async reopenAccount(id: string): Promise<void> {
    await this.updateAccount(id, { closed: false });
    this.invalidateCache(['accounts']);
  }

  // Transactions
  async getTransactions(accountId?: string): Promise<SupabaseTransaction[]> {
    const url = accountId ? `/transactions?account=${accountId}` : '/transactions';
    const cacheKey = accountId ? `transactions:account:${accountId}` : 'transactions:all';
    const cached = this.getFromCache<SupabaseTransaction[]>(cacheKey);
    if (cached) return cached;
    if (this.pending.has(cacheKey)) return await this.pending.get(cacheKey);
    const promise = (async () => {
      try {
        if (this.DEBUG) console.log('🔍 Fetching transactions from:', `${this.baseUrl}${url}`);
        const transactions = await this.request(url);
        if (this.DEBUG) {
          console.log('📊 Raw transactions from Supabase:', transactions?.length || 0, 'transactions');
          if (transactions?.length > 0) {
            console.log('📋 Sample transaction:', transactions[0]);
          }
        }
        const mapped = transactions.map((txn: any) => ({
          ...txn,
          amount: typeof txn.amount === 'number' ? txn.amount / 100 : txn.amount,
        }));
        this.setCache(cacheKey, mapped);
        return mapped as SupabaseTransaction[];
      } finally {
        this.pending.delete(cacheKey);
      }
    })();
    this.pending.set(cacheKey, promise);
    return await promise;
  }

  async createTransaction(transaction: any): Promise<string> {
    const response = await this.request('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        ...transaction,
        amount: Math.round((transaction.amount || 0) * 100),
      }),
    });

    // Invalidate related caches
    const acc = transaction.account_id || transaction.account;
    this.invalidateCache(['transactions:all', `transactions:account:${acc || ''}`, 'accounts']);

    return response.data.id;
  }

  async updateTransaction(transactionId: string, updates: any): Promise<void> {
    const updateData = { ...updates };
    
    // Keep amount in dollars (no conversion needed)
    if (updates.amount !== undefined) {
      updateData.amount = Math.round(updates.amount * 100);
    }
    
    await this.request(`/transactions/${transactionId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
    this.invalidateCache(['transactions:all', 'transactions:account:', 'accounts']);
  }

  async deleteTransaction(transactionId: string): Promise<void> {
    await this.request(`/transactions/${transactionId}`, {
      method: 'DELETE',
    });
    this.invalidateCache(['transactions:all', 'transactions:account:', 'accounts']);
  }

  async deleteAllTransactions(): Promise<void> {
    console.log('🗑️ Frontend: Sending bulk delete request to /transactions/bulk-delete');
    const response = await this.request('/transactions/bulk-delete', {
      method: 'DELETE',
    });
    console.log('✅ Frontend: Bulk delete response:', response);
    this.invalidateCache(['transactions:all', 'transactions:account:', 'accounts']);
  }

  async setBudgetAmount(categoryId: string, month: string, amountCents: number): Promise<any> {
    const response = await this.request('/budgets/set-amount', {
      method: 'POST',
      body: JSON.stringify({
        categoryId,
        month,
        amount: amountCents
      })
    });
    this.invalidateCache([`budget:${month}`, `budgetmonth:${month}`]);
    return response.data;
  }

  async getBudgetAmounts(month: string): Promise<any[]> {
    const cacheKey = `budget:${month}`;
    const cached = this.getFromCache<any[]>(cacheKey);
    if (cached) return cached;
    const data = await this.request(`/budgets/${month}`);
    this.setCache(cacheKey, data);
    return data;
  }

  // Goals
  async getGoals(): Promise<any[]> {
    const cacheKey = 'goals';
    const cached = this.getFromCache<any[]>(cacheKey);
    if (cached) return cached;
    if (this.pending.has(cacheKey)) return await this.pending.get(cacheKey);
    const promise = (async () => {
      try {
        const data = await this.request('/goals');
        this.setCache(cacheKey, data);
        return data as any[];
      } finally {
        this.pending.delete(cacheKey);
      }
    })();
    this.pending.set(cacheKey, promise);
    return await promise;
  }

  async createGoal(goalData: any): Promise<any> {
    const response = await this.request('/goals', {
      method: 'POST',
      body: JSON.stringify(goalData)
    });
    this.invalidateCache(['goals']);
    return response.data;
  }

  async updateGoal(goalId: string, updates: any): Promise<any> {
    const response = await this.request(`/goals/${goalId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    this.invalidateCache(['goals']);
    return response.data;
  }

  async deleteGoal(goalId: string): Promise<void> {
    await this.request(`/goals/${goalId}`, {
      method: 'DELETE'
    });
    this.invalidateCache(['goals']);
  }

  // Categories
  async getCategories(): Promise<SupabaseCategory[]> {
    const cacheKey = 'categories';
    const cached = this.getFromCache<SupabaseCategory[]>(cacheKey);
    if (cached) return cached;
    if (this.pending.has(cacheKey)) return await this.pending.get(cacheKey);
    const promise = (async () => {
      try {
        const data = await this.request('/categories');
        this.setCache(cacheKey, data);
        return data as SupabaseCategory[];
      } finally {
        this.pending.delete(cacheKey);
      }
    })();
    this.pending.set(cacheKey, promise);
    return await promise;
  }

  async createCategory(category: Partial<SupabaseCategory>): Promise<string> {
    const response = await this.request('/categories', {
      method: 'POST',
      body: JSON.stringify(category),
    });
    this.invalidateCache(['categories']);
    return response.data.id;
  }

  // Payees
  async getPayees(): Promise<SupabasePayee[]> {
    const cacheKey = 'payees';
    const cached = this.getFromCache<SupabasePayee[]>(cacheKey);
    if (cached) return cached;
    const data = await this.request('/payees');
    this.setCache(cacheKey, data);
    return data;
  }

  // Budget
  async getBudgetMonth(month: string): Promise<any> {
    const cacheKey = `budgetmonth:${month}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;
    if (this.pending.has(cacheKey)) return await this.pending.get(cacheKey);
    const promise = (async () => {
      try {
        const data = await this.request(`/budget/${month}`);
        this.setCache(cacheKey, data);
        return data;
      } finally {
        this.pending.delete(cacheKey);
      }
    })();
    this.pending.set(cacheKey, promise);
    return await promise;
  }

  // CSV Import
  async importTransactions(accountId: string, file: File): Promise<{ imported: number }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('accountId', accountId);

    const response = await this.request('/import-transactions', {
      method: 'POST',
      body: formData,
    });

    this.invalidateCache(['transactions:all', `transactions:account:${accountId}`, 'accounts']);
    return { imported: response.imported };
  }

  async createRazorpayOrder(amount: number, currency: string = 'INR', notes?: any): Promise<{ order_id: string; amount: number; currency: string; key_id: string; }> {
    let country = '';
    try {
      const tz = (Intl && Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions().timeZone) || '';
      if (typeof tz === 'string' && tz.toLowerCase().includes('kolkata')) country = 'IN';
    } catch {}
    try {
      const lang = (navigator && ((navigator as any).languages?.[0] || (navigator as any).language)) || '';
      if (typeof lang === 'string' && /(^|[-_])in$/i.test(lang)) country = 'IN';
    } catch {}
    const response = await this.request('/payments/razorpay/order', {
      method: 'POST',
      headers: country ? { 'x-country-code': country } : undefined,
      body: JSON.stringify({ amount, currency, notes })
    });
    return { order_id: response.order_id, amount: response.amount, currency: response.currency, key_id: response.key_id };
  }

  async verifyRazorpayPayment(payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string; }): Promise<void> {
    await this.request('/payments/razorpay/verify', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
}

// Global instance
let supabaseApiInstance: SupabaseAPI | null = null;

export function initSupabaseAPI(baseUrl: string): SupabaseAPI {
  supabaseApiInstance = new SupabaseAPI(baseUrl);
  return supabaseApiInstance;
}

export function getSupabaseAPI(): SupabaseAPI {
  if (!supabaseApiInstance) {
    throw new Error('Supabase API not initialized');
  }
  return supabaseApiInstance;
}
