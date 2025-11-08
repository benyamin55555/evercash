// Supabase Configuration and Database Client
const { createClient } = require('@supabase/supabase-js');

// Supabase credentials
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// Create Supabase admin client (service role) for admin/server-only operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Create a per-user client that will enforce RLS using the provided JWT
function getUserClient(userAccessToken) {
  return createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    },
  });
}

// Database Schema Creation SQL
const createTablesSQL = `
-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'checking',
  balance BIGINT DEFAULT 0, -- Store in cents
  closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  cat_group VARCHAR(255),
  is_income BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payees table
CREATE TABLE IF NOT EXISTS payees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  payee_id UUID REFERENCES payees(id) ON DELETE SET NULL,
  amount BIGINT NOT NULL, -- Store in cents
  date DATE NOT NULL,
  notes TEXT,
  cleared BOOLEAN DEFAULT FALSE,
  imported BOOLEAN DEFAULT FALSE,
  transfer_id UUID, -- For transfers between accounts
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Budget table
CREATE TABLE IF NOT EXISTS budget (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- First day of the month
  budgeted BIGINT DEFAULT 0, -- Store in cents
  activity BIGINT DEFAULT 0, -- Store in cents
  balance BIGINT DEFAULT 0, -- Store in cents
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, category_id, month)
);

-- Import rules table
CREATE TABLE IF NOT EXISTS import_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  conditions JSONB NOT NULL,
  actions JSONB NOT NULL,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Goals table
CREATE TABLE IF NOT EXISTS goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  target_amount BIGINT NOT NULL, -- Store in cents
  target_date DATE,
  current_amount BIGINT DEFAULT 0, -- Store in cents
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_user_id ON budget(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_month ON budget(month);
`;

// Initialize database schema function
async function initializeDatabase() {
  try {
    // Test connection by trying to select from a domain table
    const { error } = await supabase
      .from('transactions')
      .select('id')
      .limit(1);
    
    if (error && error.code === 'PGRST116') {
      console.log('⚠️ Tables not found. Please run the SQL schema in Supabase dashboard.');
      console.log('📋 SQL Schema to run:');
      console.log(createTablesSQL);
      return false;
    }
    
    console.log('✅ Database schema is ready');
    return true;
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    return false;
  }
}

// Database helper functions
class SupabaseDB {
  constructor(client = null) {
    this.client = client || supabase;
  }

  // Ensure a user row exists for the provided userId
  async ensureUserExists(userId, email = null) {
    try {
      const emailToUse = email || `demo+${userId}@emeraldbudget.local`;
      const password_hash = 'demo'; // placeholder; not used for login in dev/demo

      // Use UPSERT to avoid race conditions on concurrent requests
      const { error: upsertError } = await this.client
        .from('users')
        .upsert(
          [{ id: userId, email: emailToUse, password_hash }],
          { onConflict: 'id', ignoreDuplicates: false }
        );
      if (upsertError && upsertError.code !== '23505') {
        // Ignore duplicate key errors just in case PostgREST reports them
        throw upsertError;
      }
      if (!upsertError) {
        console.log('👤 Ensured user exists in Supabase:', userId);
      }
    } catch (err) {
      console.error('ensureUserExists error:', err);
      throw err;
    }
  }

  // User operations
  async getImportCredits(userId) {
    // Fetch user row and ensure default credit fields exist
    const { data, error } = await this.client
      .from('users')
      .select('id, email, is_premium, import_credits_total, import_credits_used')
      .eq('id', userId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    const row = data || {};
    const total = typeof row.import_credits_total === 'number' ? row.import_credits_total : 5;
    const used = typeof row.import_credits_used === 'number' ? row.import_credits_used : 0;
    const is_premium = !!row.is_premium;
    // Backfill defaults if missing
    if (!data || row.import_credits_total == null || row.import_credits_used == null) {
      await this.client
        .from('users')
        .update({
          import_credits_total: total,
          import_credits_used: used,
          is_premium
        })
        .eq('id', userId);
    }
    return { is_premium, import_credits_total: total, import_credits_used: used };
  }

  async setPremiumWithCredits(userId, totalCredits = 30) {
    // Set premium and upgrade credits to provided total
    const { error } = await this.client
      .from('users')
      .update({
        is_premium: true,
        import_credits_total: totalCredits,
        updated_at: new Date()
      })
      .eq('id', userId);
    if (error) throw error;
  }

  async incrementImportCreditsUsed(userId, inc = 1) {
    // Fetch current, then update conservatively within bounds
    const info = await this.getImportCredits(userId);
    const total = Math.max(0, info.import_credits_total || 0);
    const used = Math.max(0, info.import_credits_used || 0);
    const next = Math.min(total, used + (inc || 0));
    const { error } = await this.client
      .from('users')
      .update({ import_credits_used: next, updated_at: new Date() })
      .eq('id', userId);
    if (error) throw error;
    return { total, used: next };
  }

  async createUser(email, passwordHash) {
    const { data, error } = await this.client
      .from('users')
      .insert([{ email, password_hash: passwordHash }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getUserByEmail(email) {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async updateUserToken(userId, token) {
    const { error } = await this.client
      .from('users')
      .update({ token, updated_at: new Date() })
      .eq('id', userId);
    
    if (error) throw error;
  }

  // Account operations
  async getAccounts(userId) {
    const { data, error } = await this.client
      .from('accounts')
      .select('*')
      .eq('user_id', userId);
    if (error) {
      return [];
    }
    if (!data || data.length === 0) {
      try {
        await this.ensureDemoAccount(userId);
        const { data: refreshed } = await this.client
          .from('accounts')
          .select('*')
          .eq('user_id', userId);
        return refreshed || [];
      } catch (_) {
        return [];
      }
    }
    return data || [];
  }

  async createAccount(userId, accountData) {
    const { data, error } = await this.client
      .from('accounts')
      .insert([{ 
        user_id: userId,
        name: accountData.name || 'New Account',
        type: accountData.type || 'checking',
        balance: typeof accountData.balance === 'number' ? accountData.balance : 0,
        closed: !!accountData.closed
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async ensureDemoAccount(userId) {
    const { data: anyAcct, error: anyErr } = await this.client
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    if (anyErr) {
      return null;
    }
    if (anyAcct && anyAcct.length > 0) {
      return null;
    }

    const { data: byName } = await this.client
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('name', 'Account 1')
      .limit(1);
    if (byName && byName.length > 0) {
      return null;
    }

    const { data, error } = await this.client
      .from('accounts')
      .insert([{ 
        user_id: userId,
        name: 'Account 1',
        type: 'checking',
        balance: 0,
        closed: false
      }])
      .select()
      .single();
    if (error) {
      return null;
    }
    return data || null;
  }

  async createGoal(userId, goalData) {
    const { data, error } = await this.client
      .from('goals')
      .insert([{ user_id: userId, ...goalData }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateAccount(accountId, updates) {
    const { data, error } = await this.client
      .from('accounts')
      .update({ ...updates, updated_at: new Date() })
      .eq('id', accountId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Transaction operations
  async getTransactions(userId, accountId = null) {
    console.log('🔍 Getting transactions for user ID:', userId);
    
    // Optional legacy migration for bootstrapped data (disabled by default)
    const enableLegacyMigration = process.env.ENABLE_LEGACY_USER_MIGRATION === 'true';
    if (enableLegacyMigration) {
      const { data: oldTransactions } = await this.client
        .from('transactions')
        .select('id')
        .eq('user_id', '00000000-0000-0000-0000-000000000001')
        .limit(1);
      if (oldTransactions?.length > 0) {
        console.log('🔄 Migrating transactions from old user ID to current user ID...');
        await this.client
          .from('transactions')
          .update({ user_id: userId })
          .eq('user_id', '00000000-0000-0000-0000-000000000001');
        await this.client
          .from('accounts')
          .update({ user_id: userId })
          .eq('user_id', '00000000-0000-0000-0000-000000000001');
        await this.client
          .from('categories')
          .update({ user_id: userId })
          .eq('user_id', '00000000-0000-0000-0000-000000000001');
        await this.client
          .from('payees')
          .update({ user_id: userId })
          .eq('user_id', '00000000-0000-0000-0000-000000000001');
        await this.client
          .from('goals')
          .update({ user_id: userId })
          .eq('user_id', '00000000-0000-0000-0000-000000000001');
        console.log('✅ Migration completed! All data now belongs to current user.');
      }
    }
    
    let query = this.client
      .from('transactions')
      .select(`
        *,
        accounts(name),
        categories(name),
        payees(name)
      `)
      .eq('user_id', userId)
      .order('date', { ascending: false });
    
    if (accountId) {
      query = query.eq('account_id', accountId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async createTransaction(userId, transactionData) {
    // Handle payee - create if doesn't exist
    let payeeId = null;
    if (transactionData.payee) {
      const { data: existingPayee } = await this.client
        .from('payees')
        .select('id')
        .eq('user_id', userId)
        .eq('name', transactionData.payee)
        .single();
      
      if (existingPayee) {
        payeeId = existingPayee.id;
      } else {
        const { data: newPayee, error: payeeError } = await this.client
          .from('payees')
          .insert([{ user_id: userId, name: transactionData.payee }])
          .select('id')
          .single();
        
        if (!payeeError && newPayee) {
          payeeId = newPayee.id;
        }
      }
    }

    // Handle category - create if doesn't exist
    let categoryId = null;
    if (transactionData.category) {
      const { data: existingCategory } = await this.client
        .from('categories')
        .select('id')
        .eq('user_id', userId)
        .eq('name', transactionData.category)
        .single();
      
      if (existingCategory) {
        categoryId = existingCategory.id;
      } else {
        const { data: newCategory, error: categoryError } = await this.client
          .from('categories')
          .insert([{ user_id: userId, name: transactionData.category }])
          .select('id')
          .single();
        
        if (!categoryError && newCategory) {
          categoryId = newCategory.id;
        }
      }
    }

    // Create the transaction with proper foreign keys
    const { data, error } = await this.client
      .from('transactions')
      .insert([{ 
        user_id: userId,
        account_id: transactionData.account_id || transactionData.accountId,
        payee_id: payeeId,
        category_id: categoryId,
        amount: transactionData.amount,
        date: transactionData.date,
        notes: transactionData.notes || null,
        cleared: false,
        imported: false
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async createTransactions(userId, transactions) {
    const transactionsWithUserId = transactions.map(t => ({
      user_id: userId,
      ...t
    }));
    
    const { data, error } = await this.client
      .from('transactions')
      .insert(transactionsWithUserId)
      .select();
    
    if (error) throw error;
    return data || [];
  }

  async updateTransaction(transactionId, updates) {
    // Handle payee and category updates similar to createTransaction
    let payeeId = null;
    let categoryId = null;

    if (updates.payee) {
      // Get user_id from the transaction first
      const { data: existingTransaction } = await this.client
        .from('transactions')
        .select('user_id')
        .eq('id', transactionId)
        .single();

      if (existingTransaction) {
        const userId = existingTransaction.user_id;
        
        const { data: existingPayee } = await this.client
          .from('payees')
          .select('id')
          .eq('user_id', userId)
          .eq('name', updates.payee)
          .single();
        
        if (existingPayee) {
          payeeId = existingPayee.id;
        } else {
          const { data: newPayee, error: payeeError } = await this.client
            .from('payees')
            .insert([{ user_id: userId, name: updates.payee }])
            .select('id')
            .single();
          
          if (!payeeError && newPayee) {
            payeeId = newPayee.id;
          }
        }
      }
    }

    if (updates.category) {
      // Get user_id from the transaction first
      const { data: existingTransaction } = await this.client
        .from('transactions')
        .select('user_id')
        .eq('id', transactionId)
        .single();

      if (existingTransaction) {
        const userId = existingTransaction.user_id;
        
        const { data: existingCategory } = await this.client
          .from('categories')
          .select('id')
          .eq('user_id', userId)
          .eq('name', updates.category)
          .single();
        
        if (existingCategory) {
          categoryId = existingCategory.id;
        } else {
          const { data: newCategory, error: categoryError } = await this.client
            .from('categories')
            .insert([{ user_id: userId, name: updates.category }])
            .select('id')
            .single();
          
          if (!categoryError && newCategory) {
            categoryId = newCategory.id;
          }
        }
      }
    }

    const updateData = {
      updated_at: new Date()
    };

    // Only update fields that are actually provided
    if (updates.amount !== undefined) updateData.amount = updates.amount;
    if (updates.date !== undefined) updateData.date = updates.date;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (payeeId) updateData.payee_id = payeeId;
    if (categoryId) updateData.category_id = categoryId;

    const { data, error } = await this.client
      .from('transactions')
      .update(updateData)
      .eq('id', transactionId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteTransaction(transactionId) {
    const { error } = await this.client
      .from('transactions')
      .delete()
      .eq('id', transactionId);
    
    if (error) throw error;
  }

  async deleteAllTransactions(userId) {
    console.log('🗑️ Database: Deleting all transactions for user:', userId);
    
    try {
      // First get all transaction IDs for this user
      const { data: transactions, error: fetchError } = await this.client
        .from('transactions')
        .select('id')
        .eq('user_id', userId);
      
      if (fetchError) {
        console.error('❌ Error fetching transactions:', fetchError);
        throw fetchError;
      }
      
      if (!transactions || transactions.length === 0) {
        console.log('ℹ️ No transactions found to delete');
        return 0;
      }
      
      console.log(`🗑️ Found ${transactions.length} transactions to delete`);
      
      // Delete all transactions
      const { data, error } = await this.client
        .from('transactions')
        .delete()
        .eq('user_id', userId)
        .select('id');
      
      if (error) {
        console.error('❌ Database error during delete:', error);
        throw error;
      }
      
      const deletedCount = data ? data.length : 0;
      console.log('✅ Database: Successfully deleted', deletedCount, 'transactions');
      return deletedCount;
      
    } catch (error) {
      console.error('❌ Unexpected error in deleteAllTransactions:', error);
      throw error;
    }
  }

  // Budget operations (temporary - using categories table)
  async setBudgetAmount(userId, categoryId, month, amountCents) {
    const monthDate = `${month}-01`;
    const { data, error } = await this.client
      .from('budget')
      .upsert(
        [{
          user_id: userId,
          category_id: categoryId,
          month: monthDate,
          budgeted: amountCents,
          updated_at: new Date()
        }],
        { onConflict: 'user_id,category_id,month' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error setting budget amount:', error);
      throw error;
    }
    return data;
  }

  async getBudgetAmounts(userId, month) {
    const monthDate = `${month}-01`;
    const { data, error } = await this.client
      .from('budget')
      .select('category_id, budgeted')
      .eq('user_id', userId)
      .eq('month', monthDate);

    if (error) throw error;
    return (data || []).map(row => ({
      category_id: row.category_id,
      amount: row.budgeted || 0
    }));
  }

  // Goals operations
  async getGoals(userId) {
    const { data, error } = await this.client
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  async createGoal(userId, goalData) {
    const { data, error } = await this.client
      .from('goals')
      .insert({
        user_id: userId,
        name: goalData.name,
        target_amount: goalData.target_amount,
        current_amount: goalData.current_amount || 0,
        target_date: goalData.target_date || null
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateGoal(userId, goalId, updates) {
    const { data, error } = await this.client
      .from('goals')
      .update(updates)
      .eq('id', goalId)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteGoal(userId, goalId) {
    const { error } = await this.client
      .from('goals')
      .delete()
      .eq('id', goalId)
      .eq('user_id', userId);
    
    if (error) throw error;
  }

  async createPaymentRecord(userId, payload) {
    const { data, error } = await this.client
      .from('payments')
      .insert([{ 
        user_id: userId,
        razorpay_order_id: payload.order_id,
        amount: payload.amount,
        currency: payload.currency,
        status: payload.status || 'created',
        notes: payload.notes || null
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async markPaymentVerified(userId, orderId, paymentId, signature) {
    const { data, error } = await this.client
      .from('payments')
      .update({ 
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        status: 'paid',
        updated_at: new Date()
      })
      .eq('user_id', userId)
      .eq('razorpay_order_id', orderId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Category operations
  async getCategories(userId) {
    const { data, error } = await this.client
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order');
    
    if (error) throw error;
    
    // If no categories exist, create default ones
    if (!data || data.length === 0) {
      console.log('🏗️ Creating default categories for user:', userId);
      await this.createDefaultCategories(userId);
      
      // Fetch categories again after creating defaults
      const { data: newData, error: newError } = await this.client
        .from('categories')
        .select('*')
        .eq('user_id', userId)
        .order('sort_order');
      
      if (newError) throw newError;
      return newData || [];
    }
    
    return data || [];
  }

  async createDefaultCategories(userId) {
    const defaultCategories = [
      { name: 'Food & Dining', cat_group: 'Living Expenses', is_income: false, sort_order: 1 },
      { name: 'Shopping', is_income: false, sort_order: 2 },
      { name: 'Transportation', is_income: false, sort_order: 3 },
      { name: 'Entertainment', is_income: false, sort_order: 4 },
      { name: 'Bills & Utilities', is_income: false, sort_order: 5 },
      { name: 'Healthcare', is_income: false, sort_order: 6 },
      { name: 'Education', is_income: false, sort_order: 7 },
      { name: 'Travel', is_income: false, sort_order: 8 },
      { name: 'Personal Care', is_income: false, sort_order: 9 },
      { name: 'Gifts & Donations', is_income: false, sort_order: 10 },
      { name: 'Salary', is_income: true, sort_order: 11 },
      { name: 'Freelance', is_income: true, sort_order: 12 },
      { name: 'Investment', is_income: true, sort_order: 13 },
      { name: 'Other Income', is_income: true, sort_order: 14 },
      { name: 'Other', is_income: false, sort_order: 15 }
    ];

    const categoriesWithUserId = defaultCategories.map(cat => ({
      user_id: userId,
      ...cat
    }));

    const { error } = await this.client
      .from('categories')
      .insert(categoriesWithUserId);

    if (error) {
      console.error('Error creating default categories:', error);
      throw error;
    }

    console.log('✅ Default categories created successfully');
  }

  async createCategory(userId, categoryData) {
    const { data, error } = await this.client
      .from('categories')
      .insert([{ user_id: userId, ...categoryData }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Budget operations
  async getBudgetMonth(userId, month) {
    const { data, error } = await this.client
      .from('budget')
      .select(`
        *,
        categories(name, cat_group, is_income)
      `)
      .eq('user_id', userId)
      .eq('month', month);
    
    if (error) throw error;
    return data || [];
  }

  // Payee operations
  async getPayees(userId) {
    const { data, error } = await this.client
      .from('payees')
      .select('*')
      .eq('user_id', userId)
      .order('name');
    
    if (error) throw error;
    return data || [];
  }

  async createPayee(userId, name) {
    const { data, error } = await this.client
      .from('payees')
      .insert([{ user_id: userId, name }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}

module.exports = {
  supabase,
  SupabaseDB,
  initializeDatabase,
  createTablesSQL,
  getUserClient
};
