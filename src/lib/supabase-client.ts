import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Supabase configuration (graceful in prod if missing)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export let supabase: SupabaseClient | null = null;
try {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing). Auth features are disabled.');
  } else {
    supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  }
} catch (e) {
  console.error('Failed to initialize Supabase client:', e);
  supabase = null;
}

// Database types
export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface OnboardingData {
  id: string;
  user_id: string;
  name: string;
  income_range: string;
  savings_goal: string;
  custom_goal?: string;
  goal_amount: number;
  expense_categories: ExpenseCategory[];
  import_type: string;
  created_at: string;
}

export interface ExpenseCategory {
  id: string;
  category: string;
  amount: number;
}

// Auth helpers
export const signInWithGoogle = async () => {
  if (!supabase) throw new Error('Supabase not configured');
  // Use current origin (localhost in dev, production in prod) for redirect
  const redirectUrl = window.location.origin.includes('localhost') 
    ? window.location.origin 
    : (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin);
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${redirectUrl}/auth/callback`,
      queryParams: {
        prompt: 'select_account',
      },
      scopes: 'openid profile email',
    },
  });
  
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = async () => {
  if (!supabase) return null;
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
};

// User profile helpers
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
  
  return data;
};

export const createUserProfile = async (profile: Partial<UserProfile>): Promise<UserProfile | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_profiles')
    .insert([profile])
    .select()
    .single();
  
  if (error) {
    console.error('Error creating user profile:', error);
    return null;
  }
  
  return data;
};

export const updateUserProfile = async (userId: string, updates: Partial<UserProfile>): Promise<UserProfile | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating user profile:', error);
    return null;
  }
  
  return data;
};

// Onboarding data helpers
export const saveOnboardingData = async (onboardingData: Omit<OnboardingData, 'id' | 'created_at'>): Promise<OnboardingData | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('onboarding_data')
    .insert([onboardingData])
    .select()
    .single();
  
  if (error) {
    console.error('Error saving onboarding data:', error);
    return null;
  }
  
  return data;
};

export const getOnboardingData = async (userId: string): Promise<OnboardingData | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('onboarding_data')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error) {
    console.error('Error fetching onboarding data:', error);
    return null;
  }
  
  return data;
};
