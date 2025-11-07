import { useState, useEffect } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trophy, 
  Loader2, 
  Edit2,
  Home,
  Car,
  Smartphone,
  DollarSign,
  Heart,
  Trash2,
  Coffee,
  ShoppingBag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIInsightBadge } from "@/components/AIInsightBadge";
import { StreakBadge } from "@/components/StreakBadge";
import { useApi } from '@/contexts/HybridApiContext';
import { useSimpleCurrency } from "@/contexts/SimpleCurrencyContext";
import { parseCurrencyInput } from "@/lib/currency";
import { toast } from "sonner";
import type { BudgetMonth, CategoryGroup } from "@/lib/api";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

export default function Budgets() {
  const { api, loading } = useApi();
  const { formatAmount } = useSimpleCurrency();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  });
  const [budgetData, setBudgetData] = useState<BudgetMonth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryBudget, setNewCategoryBudget] = useState("");

  useEffect(() => {
    if (api) {
      loadBudgetData();
    }
  }, [api, currentMonth]);

  // Refresh when transactions change elsewhere (e.g., goal allocations, imports)
  useEffect(() => {
    const handler = () => loadBudgetData();
    window.addEventListener('transactions-updated', handler);
    return () => window.removeEventListener('transactions-updated', handler);
  }, []);

  const loadBudgetData = async () => {
    if (!api) return;
    
    setIsLoading(true);
    try {
      const data = await api.getBudgetMonth(currentMonth);
      console.log('Fetched budget data for', currentMonth, data);
      
      // Log specific category data to debug budget amounts
      if (data.categoryGroups) {
        data.categoryGroups.forEach(group => {
          console.log(`Group: ${group.name}`);
          group.categories.forEach(cat => {
            console.log(`  Category: ${cat.name}, Budgeted: ${cat.budgeted}, Spent: ${cat.spent}, Balance: ${cat.balance}`);
          });
        });
      }
      
      setBudgetData(data);
    } catch (error) {
      console.error("Error loading budget data:", error);
      toast.error("Failed to load budget data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1);
    
    if (direction === 'prev') {
      date.setMonth(date.getMonth() - 1);
    } else {
      date.setMonth(date.getMonth() + 1);
    }
    
    const newMonth = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    setCurrentMonth(newMonth);
  };

  const handleDeleteBudget = async (categoryId: string, categoryName: string) => {
    if (!api) return;
    
    try {
      // Show confirmation
      if (!confirm(`Are you sure you want to remove the budget for "${categoryName}"? This will set the budget amount to $0.`)) {
        return;
      }
      
      // Set budget amount to 0 to effectively "delete" the budget
      await api.setBudgetAmount(currentMonth, categoryId, 0);
      toast.success(`Budget for "${categoryName}" removed and hidden from view`);
      await loadBudgetData();
    } catch (error) {
      console.error('Failed to remove budget:', error);
      toast.error('Failed to remove budget');
    }
  };

  const handleBudgetUpdate = async (categoryId: string) => {
    if (!api || !editAmount) return;
    
    try {
      const amountDollars = parseFloat(editAmount);
      console.log('Updating budget:', { currentMonth, categoryId, editAmount, amountDollars });
      
      const result = await api.setBudgetAmount(currentMonth, categoryId, amountDollars);
      console.log('Budget update result:', result);
      
      console.log('Waiting 500ms before reloading data...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      toast.success("Budget updated successfully");
      setEditingCategory(null);
      setEditAmount("");
      
      // Reload budget data to show updated values
      await loadBudgetData();
    } catch (error) {
      console.error("Error updating budget:", error);
      toast.error("Failed to update budget");
    }
  };

  const handleCreateCategory = async () => {
    if (!api || !newCategoryName || !selectedGroup) return;
    
    try {
      await api.createCategory({
        name: newCategoryName,
        cat_group: selectedGroup,
        is_income: false,
      });
      
      // Set initial budget amount if provided
      if (newCategoryBudget) {
        // This would need the category ID, but for now we'll skip this
        // In a full implementation, createCategory would return the ID
      }
      toast.success("Category created successfully");
      setCreateDialogOpen(false);
      setNewCategoryName("");
      setSelectedGroup("");
      setNewCategoryBudget("");
      await loadBudgetData();
    } catch (error) {
      console.error("Error creating category:", error);
      toast.error("Failed to create category");
    }
  };

  // Using imported formatAmount function

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getIconForCategory = (categoryName: string) => {
    const name = categoryName.toLowerCase();
    if (name.includes('food') || name.includes('groceries')) return ShoppingBag;
    if (name.includes('dining') || name.includes('restaurant')) return Coffee;
    if (name.includes('housing') || name.includes('rent') || name.includes('mortgage')) return Home;
    if (name.includes('transport') || name.includes('car') || name.includes('gas')) return Car;
    if (name.includes('util') || name.includes('electric') || name.includes('phone')) return Smartphone;
    if (name.includes('entertain') || name.includes('fun')) return Heart;
    return DollarSign;
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading budget...</span>
      </div>
    );
  }

  const expenseGroups = budgetData?.categoryGroups?.filter(g => !g.is_income) || [];
  const onTrackCount = expenseGroups.reduce((count, group) => {
    return count + (group.categories?.filter(cat => 
      (cat.budgeted || 0) > Math.abs(cat.spent || 0)
    ).length || 0);
  }, 0);

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">Budget for {formatMonth(currentMonth)}</h1>
          <p className="text-muted-foreground">Manage your spending categories</p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline"
            onClick={() => handleMonthChange('prev')}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button 
            variant="outline"
            onClick={() => handleMonthChange('next')}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
          <Button 
            onClick={() => setCreateDialogOpen(true)}
            className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold shadow-[0_0_10px_rgba(16,185,129,0.25)] dark:bg-gradient-to-r dark:from-[#7BEF2D] dark:to-[#7BEF2D] dark:hover:from-[#7BEF2D]/90 dark:hover:to-[#7BEF2D]/80 dark:text-black dark:shadow-[0_0_15px_rgba(123,239,45,0.4)]"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Category
          </Button>
        </div>
      </div>

      {/* Budget Summary */}
      <div className="glass-card p-6 rounded-2xl border-accent/20">
        <h2 className="text-xl font-bold mb-4">Budget Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl p-4 bg-muted/40 dark:bg-white/5 border border-border/40 dark:border-white/10 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Total Budgeted</p>
            <p className="text-2xl font-bold text-foreground">{formatAmount((budgetData?.totalBudgeted || 0))}</p>
          </div>
          <div className="rounded-xl p-4 bg-muted/40 dark:bg-white/5 border border-border/40 dark:border-white/10 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Total Spent</p>
            <p className="text-2xl font-bold text-foreground">{formatAmount((budgetData?.totalSpent || 0))}</p>
          </div>
          <div className="rounded-xl p-4 bg-muted/40 dark:bg-white/5 border border-border/40 dark:border-white/10 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Total Income</p>
            <p className="text-2xl font-bold text-green-600 dark:text-[#7BEF2D]">{formatAmount((budgetData?.totalIncome || 0))}</p>
          </div>
          <div className="rounded-xl p-4 bg-muted/40 dark:bg-white/5 border border-border/40 dark:border-white/10 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">To Budget</p>
            <p className="text-2xl font-bold text-accent">{formatAmount((budgetData?.toBudget || 0))}</p>
          </div>
        </div>
      </div>

      {/* Gamification & Insights */}
      <div className="flex flex-wrap gap-3 animate-fade-in-up">
        <StreakBadge days={14} />
        <div className="glass-card px-4 py-2 rounded-full border-accent/30 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          <span className="text-sm font-semibold">{onTrackCount} categories on track</span>
        </div>
        {budgetData && budgetData.toBudget < 0 && (
          <AIInsightBadge
            type="warning"
            message="Overbudget"
            detail={`You've overbudgeted by ${formatAmount(Math.abs(budgetData.toBudget))}`}
          />
        )}
      </div>

      {/* Category Groups */}
      <div className="space-y-6">
        {expenseGroups.map((group) => (
          <div key={group.id} className="glass-card p-6 rounded-2xl">
            <h3 className="text-lg font-semibold mb-4">{group.name}</h3>
            <div className="space-y-3">
              {(group.categories || [])
                .filter(category => (category.budgeted || 0) > 0) // Only show categories with budget > $0
                .map((category) => {
                const Icon = getIconForCategory(category.name);
                const budgeted = (category.budgeted || 0); // Already in dollars
                const spent = Math.abs((category.spent || 0)); // Already in dollars
                const remaining = budgeted - spent;
                const percentSpent = budgeted > 0 ? (spent / budgeted) * 100 : 0;
                
                return (
                  <div key={category.id} className="p-4 rounded-lg border border-border/50 hover:border-accent/30 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-400/30 dark:from-[#7BEF2D]/20 dark:to-[#7BEF2D]/30 flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.2)] dark:shadow-[0_0_10px_rgba(123,239,45,0.2)]">
                          <Icon className="w-5 h-5 text-emerald-600 dark:text-[#7BEF2D]" />
                        </div>
                        <div>
                          <h4 className="font-medium">{category.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {formatAmount(spent)} of {formatAmount(budgeted)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${remaining >= 0 ? 'text-emerald-600 dark:text-[#7BEF2D]' : 'text-red-400'}`}>
                          {remaining >= 0 ? 'Remaining' : 'Overspent'}: {formatAmount(Math.abs(remaining))}
                        </span>
                        {editingCategory === category.id ? (
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              className="w-24 h-8"
                              placeholder="0.00"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={() => handleBudgetUpdate(category.id)}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingCategory(null);
                                setEditAmount("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingCategory(category.id);
                                setEditAmount(budgeted.toString());
                              }}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteBudget(category.id, category.name)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                    <Progress value={Math.min(percentSpent, 100)} className="h-2" />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Create Category Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Category</DialogTitle>
            <DialogDescription>
              Add a new budget category to track your expenses
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Category Name</Label>
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g., Coffee"
              />
            </div>
            <div className="grid gap-2">
              <Label>Category Group</Label>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                <option value="">Select a group</option>
                {expenseGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Budget Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={newCategoryBudget}
                onChange={(e) => setNewCategoryBudget(e.target.value)}
                placeholder="e.g., 500.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCategory}>
              Create Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
