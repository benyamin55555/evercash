import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TransactionItem } from "@/components/TransactionItem";
import { BankSyncModal } from "@/components/BankSyncModal";
import { Badge } from "@/components/ui/badge";
import { useApi } from '@/contexts/HybridApiContext';
import { toast } from "sonner";
import { Loader2, Plus, Search, Filter, Upload, Download, Repeat, Edit, Trash2, AlertTriangle, TrendingUp, TrendingDown, RotateCcw } from "lucide-react";
import '@/lib/debug-categorization'; // Makes window.debugCategorization() available
import '@/lib/direct-categorizer'; // Makes window.directCategorizeAll() available
import type { Transaction, Account, Category, Payee } from "@/lib/api";
import { sanitizeInput, sanitizeAmount, sanitizeNotes } from "@/lib/sanitize";
import { scheduledTransactions } from "@/lib/scheduled-transactions";
import { ImportRulesEngine } from "@/lib/import-rules";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function Transactions() {
  const { api } = useApi();
  const navigate = useNavigate();
  const [bankSyncOpen, setBankSyncOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRecategorizing, setIsRecategorizing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const creatingRef = useRef(false);
  const [recatProcessed, setRecatProcessed] = useState(0);
  const [recatTotal, setRecatTotal] = useState(0);
  const [recatUpdated, setRecatUpdated] = useState(0);
  const stopRef = useRef(false);
  const [transactionFilter, setTransactionFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [formData, setFormData] = useState({
    account: "",
    payee: "",
    category: "",
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    notes: "",
    type: 'expense' as 'expense' | 'income',
  });
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (api) {
      loadData();
    }
  }, [api]);

  const loadData = async () => {
    if (!api) return;
    
    setIsLoading(true);
    try {
      const [txData, accData, catData, payeeData] = await Promise.all([
        api.getTransactions(),
        api.getAccounts(),
        api.getCategories() as Promise<Category[]>,
        api.getPayees(),
      ]);
      
      setTransactions(txData);
      setAccounts(accData);
      setCategories(catData);
      setPayees(payeeData);
      
      // Debug categories
      console.log('📋 Categories loaded:', catData);
      console.log('📋 Categories count:', catData.length);
      console.log('📋 Non-income categories:', catData.filter(c => !c.is_income));
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load transactions");
    } finally {
      setIsLoading(false);
    }
  };

  const openTransactionDetails = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setFormData({
      account: transaction.account,
      payee: transaction.payee,
      category: transaction.category,
      amount: Math.abs(transaction.amount),
      date: transaction.date,
      notes: transaction.notes || "",
      type: transaction.amount < 0 ? 'expense' : 'income',
    });
    setEditDialogOpen(true);
  };

  const handleCreateTransaction = async () => {
    if (!api || creatingRef.current) return;
    try {
      creatingRef.current = true;
      setIsCreating(true);
      // Sanitize inputs
      const sanitizedPayee = sanitizeInput(formData.payee);
      const sanitizedNotes = sanitizeNotes(formData.notes);
      const sanitizedAmount = sanitizeAmount(formData.amount);
      
      // Validate
      if (!sanitizedPayee || sanitizedAmount <= 0) {
        toast.error("Please enter valid payee and amount");
        return;
      }
      
      // Auto-categorize if no category is selected
      let category = formData.category;
      if (!category || category === '' || category === 'Other' || category === 'Uncategorized') {
        category = await autoCategorizeTransaction({
          payee: sanitizedPayee,
          notes: sanitizedNotes,
          amount: formData.type === 'expense' ? -sanitizedAmount : sanitizedAmount,
          date: formData.date
        });
      }
      
      const signedAmount = formData.type === 'expense' ? -sanitizedAmount : sanitizedAmount;
      await api.addTransactions(formData.account, [{
        id: crypto.randomUUID(), // Use UUID instead of Date.now() to prevent race conditions
        payee: sanitizedPayee,
        category: category,
        amount: signedAmount, // Keep in dollars, will be converted to cents in API
        date: formData.date,
        notes: sanitizedNotes,
      }]);
      toast.success("✅ Transaction added and auto-categorized");
      setCreateDialogOpen(false);
      await loadData();
    } catch (error) {
      console.error("Error creating transaction:", error);
      toast.error("❌ Failed to create transaction");
    } finally {
      setIsCreating(false);
      creatingRef.current = false;
    }
  };

  // Auto-categorize new transactions using AI
  const autoCategorizeTransaction = async (transactionData: any) => {
    try {
      const { aiCategorizer } = await import('@/lib/ai-categorizer');
      
      if (aiCategorizer.isConfigured()) {
        const result = await aiCategorizer.categorizeTransaction({
          description: transactionData.payee || transactionData.notes || '',
          amount: transactionData.amount,
          date: transactionData.date
        });
        
        // Use AI category if confidence is high enough
        if (result.confidence > 0.6) {
          console.log(`🤖 Auto-categorized: "${transactionData.payee}" → ${result.category} (${Math.round(result.confidence * 100)}%)`);
          return result.category;
        }
      }
    } catch (error) {
      console.warn('Auto-categorization failed:', error);
    }
    
    return transactionData.category; // Return original category if AI fails
  };


  const handleUpdateTransaction = async () => {
    if (!api || !selectedTransaction) return;
    
    try {
      // Sanitize inputs
      const sanitizedPayee = sanitizeInput(formData.payee);
      const sanitizedNotes = sanitizeNotes(formData.notes);
      const sanitizedAmount = sanitizeAmount(formData.amount);
      
      // Validate
      if (!sanitizedPayee || sanitizedAmount <= 0) {
        toast.error("Please enter valid payee and amount");
        return;
      }
      
      await api.updateTransaction(selectedTransaction.id, {
        payee: sanitizedPayee,
        category: formData.category,
        amount: sanitizedAmount, // Keep in dollars, will be converted to cents in API
        date: formData.date,
        notes: sanitizedNotes,
      });
      
      toast.success("✅ Transaction updated securely");
      setEditDialogOpen(false);
      await loadData();
    } catch (error) {
      console.error("Error updating transaction:", error);
      toast.error("❌ Failed to update transaction");
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!api) return;
    
    try {
      await api.deleteTransaction(id);
      setTransactions(prev => prev.filter(t => t.id !== id));
      toast.success("Transaction deleted successfully");
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast.error("Failed to delete transaction");
    }
  };

  const handleDeleteAllTransactions = async () => {
    if (!api || deleteConfirmText !== "delete all transactions") {
      toast.error("Please type 'delete all transactions' exactly to confirm");
      return;
    }

    setIsDeleting(true);
    try {
      await api.deleteAllTransactions();
      setTransactions([]);
      setDeleteAllDialogOpen(false);
      setDeleteConfirmText("");
      toast.success("All transactions deleted successfully");
    } catch (error) {
      console.error("Error deleting all transactions:", error);
      toast.error("Failed to delete all transactions");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    // Amount is already in dollars from the API (converted from cents)
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return `Today, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } else {
      const daysAgo = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo < 7) {
        return `${daysAgo} days ago`;
      }
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const getPayeeName = useMemo(() => {
    const payeeMap = new Map();
    payees.forEach(p => payeeMap.set(p.id, p.name));
    
    return (payeeId: string) => {
      if (!payeeId) return 'Unknown';
      return payeeMap.get(payeeId) || payeeId;
    };
  }, [payees]);

  const getCategoryName = useMemo(() => {
    const categoryMap = new Map();
    categories.forEach(c => {
      categoryMap.set(c.id, c.name);
      categoryMap.set(c.name, c.name);
    });
    
    const validCategoryNames = ['Food & Dining', 'Shopping', 'Transportation', 'Entertainment', 
                               'Bills & Utilities', 'Healthcare', 'Education', 'Travel', 
                               'Personal Care', 'Gifts & Donations', 'Salary', 'Freelance', 
                               'Investment', 'Other Income', 'Other'];
    
    return (categoryIdOrName: string) => {
      if (!categoryIdOrName) return 'Uncategorized';
      return categoryMap.get(categoryIdOrName) || 
             (validCategoryNames.includes(categoryIdOrName) ? categoryIdOrName : 'Uncategorized');
    };
  }, [categories]);

  const getAccountName = useMemo(() => {
    const accountMap = new Map();
    accounts.forEach(a => accountMap.set(a.id, a.name));
    
    return (accountId: string) => {
      if (!accountId) return 'Unknown';
      return accountMap.get(accountId) || accountId;
    };
  }, [accounts]);

  // Handle deep-linking from Dashboard (payee filter or direct txId)
  useEffect(() => {
    if (isLoading) return;
    const txId = searchParams.get('txId');
    const payeeName = searchParams.get('payee');
    if (txId) {
      const tx = transactions.find(t => t.id === txId);
      if (tx) {
        openTransactionDetails(tx);
      }
      return;
    }
    if (payeeName) {
      try { setSearchTerm(payeeName); } catch {}
      const latest = [...transactions]
        .filter(t => getPayeeName(t.payee) === payeeName)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      if (latest) {
        openTransactionDetails(latest);
      }
    }
  }, [isLoading, transactions, searchParams]);

  // Calculate counts for filter cards
  const incomeCount = transactions.filter(tx => tx.amount > 0).length;
  const expenseCount = transactions.filter(tx => tx.amount < 0).length;

  const filteredTransactions = transactions.filter(tx => {
    // Apply type filter first
    if (transactionFilter === 'income' && tx.amount <= 0) return false;
    if (transactionFilter === 'expense' && tx.amount >= 0) return false;
    
    // Then apply search filter
    if (!searchTerm) return true;
    const payeeName = getPayeeName(tx.payee).toLowerCase();
    const categoryName = getCategoryName(tx.category).toLowerCase();
    const accountName = getAccountName(tx.account).toLowerCase();
    const amount = Math.abs(tx.amount).toString();
    const notes = (tx.notes || '').toLowerCase();
    
    return payeeName.includes(searchTerm.toLowerCase()) ||
           categoryName.includes(searchTerm.toLowerCase()) ||
           accountName.includes(searchTerm.toLowerCase()) ||
           amount.includes(searchTerm) ||
           notes.includes(searchTerm.toLowerCase());
  });

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading transactions...</span>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl md:text-4xl font-bold mb-2">Transactions</h1>
          <p className="text-muted-foreground text-sm md:text-base">View and manage all your transactions</p>
        </div>
        {/* Desktop: All buttons in one row */}
        <div className="hidden md:flex gap-3">
          <Button
            onClick={async () => {
              if (!api || isRecategorizing) return;
              try {
                setIsRecategorizing(true);
                toast.info("Recategorising in background…");
                const { aiCategorizer } = await import('@/lib/ai-categorizer');
                const toProcess = [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1));
                setRecatProcessed(0);
                setRecatTotal(toProcess.length);
                setRecatUpdated(0);
                stopRef.current = false;
                let updated = 0;
                for (const tx of toProcess) {
                  if (stopRef.current) break;
                  try {
                    const desc = getPayeeName(tx.payee) || tx.notes || '';
                    const result = await aiCategorizer.categorizeTransaction({
                      description: desc,
                      amount: tx.amount,
                      date: tx.date,
                    });
                    if (result && result.category) {
                      await api.updateTransaction(tx.id, { category: result.category });
                      updated++;
                      setRecatUpdated(prev => prev + 1);
                    }
                  } catch {}
                  setRecatProcessed(prev => prev + 1);
                  await new Promise(r => setTimeout(r, 75));
                }
                if (stopRef.current) {
                  toast.info(`Stopped recategorising after ${recatProcessed}/${recatTotal} (updated ${updated})`);
                } else {
                  toast.success(`Recategorised ${updated} transactions`);
                }
                await loadData();
              } catch (e) {
                toast.error("Failed to recategorise");
              } finally {
                setIsRecategorizing(false);
              }
            }}
            variant="outline"
            disabled={transactions.length === 0 || isRecategorizing}
            className="border-accent/30 hover:bg-accent/10 text-sm px-4 py-2"
          >
            {isRecategorizing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Recategorising…
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4 mr-2" />
                Recategorise
              </>
            )}
          </Button>
          <Button
            onClick={() => setDeleteAllDialogOpen(true)}
            variant="destructive"
            disabled={transactions.length === 0}
            className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-2"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete All ({transactions.length})
          </Button>
          {/* Import removed per request */}
          <Button
            onClick={() => {
              setFormData({
                account: accounts[0]?.id || "",
                payee: "",
                category: "",
                amount: 0,
                date: new Date().toISOString().split('T')[0],
                notes: "",
                type: 'expense',
              });
              setCreateDialogOpen(true);
            }}
            className="bg-gradient-emerald hover:opacity-90 text-sm px-4 py-2"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Transaction
          </Button>
        </div>

        {/* Mobile: Two rows layout */}
        <div className="md:hidden space-y-3">
          {/* First row: Recat, Delete */}
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (!api || isRecategorizing) return;
                try {
                  setIsRecategorizing(true);
                  toast.info("Recategorising in background…");
                  const { aiCategorizer } = await import('@/lib/ai-categorizer');
                  const toProcess = [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1));
                  setRecatProcessed(0);
                  setRecatTotal(toProcess.length);
                  setRecatUpdated(0);
                  stopRef.current = false;
                  let updated = 0;
                  for (const tx of toProcess) {
                    if (stopRef.current) break;
                    try {
                      const desc = getPayeeName(tx.payee) || tx.notes || '';
                      const result = await aiCategorizer.categorizeTransaction({
                        description: desc,
                        amount: tx.amount,
                        date: tx.date,
                      });
                      if (result && result.category) {
                        await api.updateTransaction(tx.id, { category: result.category });
                        updated++;
                        setRecatUpdated(prev => prev + 1);
                      }
                    } catch {}
                    setRecatProcessed(prev => prev + 1);
                    await new Promise(r => setTimeout(r, 75));
                  }
                  if (stopRef.current) {
                    toast.info(`Stopped recategorising after ${recatProcessed}/${recatTotal} (updated ${updated})`);
                  } else {
                    toast.success(`Recategorised ${updated} transactions`);
                  }
                  await loadData();
                } catch (e) {
                  toast.error("Failed to recategorise");
                } finally {
                  setIsRecategorizing(false);
                }
              }}
              variant="outline"
              disabled={transactions.length === 0 || isRecategorizing}
              className="border-accent/30 hover:bg-accent/10 text-xs px-2 py-2 flex-1"
            >
              {isRecategorizing ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Recat…
                </>
              ) : (
                <>
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Recat
                </>
              )}
            </Button>
            <Button
              onClick={() => setDeleteAllDialogOpen(true)}
              variant="destructive"
              disabled={transactions.length === 0}
              className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-2 flex-1"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Del ({transactions.length})
            </Button>
            {/* Import removed per request */}
          </div>
          
          {/* Second row: Add Transaction (full width, bigger) */}
          <Button
            onClick={() => {
              setFormData({
                account: accounts[0]?.id || "",
                payee: "",
                category: "",
                amount: 0,
                date: new Date().toISOString().split('T')[0],
                notes: "",
                type: 'expense',
              });
              setCreateDialogOpen(true);
            }}
            className="bg-gradient-emerald hover:opacity-90 text-sm px-4 py-3 w-full h-12"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Transaction
          </Button>
        </div>
      </div>

      {/* Sync Status Badge */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3 animate-fade-in-up">
        <Badge variant="outline" className="bg-accent/20 text-accent border-accent/30 text-xs md:text-sm">
          <span className="w-2 h-2 rounded-full bg-accent mr-1.5 animate-pulse"></span>
          <span className="hidden sm:inline">Live sync enabled</span>
          <span className="sm:hidden">Live sync</span>
        </Badge>
        <Badge variant="outline" className="text-xs md:text-sm">
          {filteredTransactions.length} {transactionFilter === 'all' ? 'transactions' : transactionFilter}
        </Badge>
      </div>

      {/* Income/Expense Filter Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in-up">
        <div 
          className={`glass-card p-4 rounded-xl cursor-pointer transition-all hover:scale-105 ${
            transactionFilter === 'income' ? 'ring-2 ring-[#10B981] bg-green-50 dark:bg-[#10B981]/10' : 'hover:bg-accent/5'
          }`}
          onClick={() => setTransactionFilter(transactionFilter === 'income' ? 'all' : 'income')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Income</p>
              <p className="text-2xl font-bold text-green-600 dark:text-[#10B981]">{incomeCount}</p>
            </div>
            <div className="p-3 rounded-full bg-green-100 dark:bg-[#10B981]/20">
              <TrendingUp className="w-6 h-6 text-green-600 dark:text-[#10B981]" />
            </div>
          </div>
        </div>

        <div 
          className={`glass-card p-4 rounded-xl cursor-pointer transition-all hover:scale-105 ${
            transactionFilter === 'expense' ? 'ring-2 ring-red-500 bg-red-50 dark:bg-red-950/20' : 'hover:bg-accent/5'
          }`}
          onClick={() => setTransactionFilter(transactionFilter === 'expense' ? 'all' : 'expense')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Expenses</p>
              <p className="text-2xl font-bold text-red-600">{expenseCount}</p>
            </div>
            <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div 
          className={`p-4 rounded-xl cursor-pointer transition-all hover:scale-105 border border-border bg-card ${
            transactionFilter === 'all' ? 'ring-2 ring-blue-500' : 'hover:bg-accent/5'
          }`}
          onClick={() => setTransactionFilter('all')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">All Transactions</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{transactions.length}</p>
            </div>
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <RotateCcw className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 md:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 md:pl-12 h-10 md:h-12 bg-muted/30 border-border/50 focus:border-accent/50 transition-colors text-sm md:text-base"
            aria-label="Search transactions"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-10 md:h-12 border-accent/30 hover:bg-accent/10 px-3 md:px-4 text-xs md:text-sm"
            >
              <Filter className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Filter</span>
              <span className="sm:hidden">Filter</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTransactionFilter('all')}>All</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTransactionFilter('income')}>Income</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTransactionFilter('expense')}>Expense</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-2xl border border-border bg-card dark:bg-black shadow-lg overflow-hidden flex flex-col h-[calc(100vh-28rem)] md:h-[800px]">
        <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
          <h2 className="text-xl font-bold text-black dark:text-white">
            {transactionFilter === 'all' ? 'All Transactions' : 
             transactionFilter === 'income' ? 'Income Transactions' : 
             'Expense Transactions'}
          </h2>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={async () => {
              // Export functionality
              toast.info("Export feature coming soon");
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {filteredTransactions.slice(0, 100).map((transaction) => (
            <div 
              key={transaction.id}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/5 transition-colors group"
            >
              <TransactionItem
                merchant={getPayeeName(transaction.payee)}
                category={getCategoryName(transaction.category)}
                amount={transaction.amount}
                date={formatDate(transaction.date)}
              />
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedTransaction(transaction);
                    setFormData({
                      account: transaction.account,
                      payee: transaction.payee,
                      category: transaction.category,
                      amount: Math.abs(transaction.amount),
                      date: transaction.date,
                      notes: transaction.notes || "",
                      type: transaction.amount < 0 ? 'expense' : 'income',
                    });
                    setEditDialogOpen(true);
                  }}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteTransaction(transaction.id)}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <BankSyncModal open={bankSyncOpen} onOpenChange={setBankSyncOpen} />

      {isRecategorizing && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg bg-white text-black border border-gray-200 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="min-w-[180px]">
              <div className="text-xs font-semibold tracking-wide">Recategorising</div>
              <div className="text-xs font-mono mt-0.5">
                Categorised {recatUpdated}/{recatTotal} • Left {Math.max(recatTotal - recatProcessed, 0)}
              </div>
              <div className="mt-2 h-1.5 w-full bg-gray-100 rounded">
                <div
                  className="h-1.5 rounded bg-black"
                  style={{ width: `${recatTotal > 0 ? Math.min(100, Math.round((recatProcessed / recatTotal) * 100)) : 0}%` }}
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { stopRef.current = true; }}
              className="h-7 px-2 text-xs"
            >
              Stop
            </Button>
          </div>
        </div>
      )}

      {/* Create Transaction Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Transaction</DialogTitle>
            <DialogDescription>
              Create a new transaction entry
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-4 mb-2">
            <span className="text-xs font-semibold">Type:</span>
            <button
              type="button"
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${formData.type === 'expense' ? 'bg-red-500 text-white border-red-500' : 'bg-transparent border-muted-foreground text-muted-foreground hover:bg-red-500/10'}`}
              onClick={() => setFormData(f => ({ ...f, type: 'expense' }))}
            >Expense</button>
            <button
              type="button"
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${formData.type === 'income' ? 'bg-green-500 text-white border-green-500 dark:bg-[#10B981] dark:text-black dark:border-[#10B981]' : 'bg-transparent border-muted-foreground text-muted-foreground hover:bg-green-500/10 dark:hover:bg-[#10B981]/10'}`}
              onClick={() => setFormData(f => ({ ...f, type: 'income' }))}
            >Income</button>
          </div>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Account</Label>
              <Select
                value={formData.account}
                onValueChange={(value) => setFormData({ ...formData, account: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.filter(a => !a.closed).map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Payee</Label>
              <Input
                value={formData.payee}
                onChange={(e) => setFormData({ ...formData, payee: e.target.value })}
                placeholder="e.g., Starbucks, Amazon, John Doe"
              />
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.filter(c => formData.type === 'income' ? c.is_income : !c.is_income).map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Add notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTransaction} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>Add Transaction</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>
              Update transaction details
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Payee</Label>
              <Input
                value={formData.payee}
                onChange={(e) => setFormData({ ...formData, payee: e.target.value })}
                placeholder="e.g., Starbucks, Amazon, John Doe"
              />
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.filter(c => formData.type === 'income' ? c.is_income : !c.is_income).map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Add notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTransaction}>
              Update Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete All Confirmation Dialog */}
      <Dialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Delete All Transactions
            </DialogTitle>
            <DialogDescription className="text-left">
              ⚠️ <strong>This action cannot be undone!</strong>
              <br /><br />
              You are about to permanently delete <strong>{transactions.length} transactions</strong>.
              <br /><br />
              To confirm, please type <code className="bg-muted px-2 py-1 rounded text-sm font-mono">delete all transactions</code> exactly:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type 'delete all transactions' to confirm"
              className="font-mono"
              disabled={isDeleting}
            />
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteAllDialogOpen(false);
                  setDeleteConfirmText("");
                }}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAllTransactions}
                disabled={deleteConfirmText !== "delete all transactions" || isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete All Transactions
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
