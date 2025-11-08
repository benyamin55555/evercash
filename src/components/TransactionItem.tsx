import { Coffee, ShoppingBag, Home, Car, Smartphone, MoreHorizontal } from "lucide-react";
import { useSimpleCurrency } from "@/contexts/SimpleCurrencyContext";

interface TransactionItemProps {
  merchant: string;
  category: string;
  amount: number;
  date: string;
}

const categoryIcons = {
  dining: Coffee,
  shopping: ShoppingBag,
  housing: Home,
  transport: Car,
  utilities: Smartphone,
};

export function TransactionItem({ merchant, category, amount, date }: TransactionItemProps) {
  const { formatAmount } = useSimpleCurrency();
  const Icon = categoryIcons[category as keyof typeof categoryIcons] || MoreHorizontal;
  const isPositive = amount > 0;

  return (
    <div className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl hover:bg-muted/30 transition-all duration-300 group cursor-pointer">
      <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-emerald-subtle flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
        <Icon className="w-4 h-4 md:w-5 md:h-5 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm md:text-base truncate max-w-full text-black dark:text-white" title={merchant}>{merchant}</p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1">
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-white dark:border-0 truncate max-w-fit category-chip-dark">
            {category}
          </span>
          <span className="text-xs text-gray-700 dark:text-gray-300">{date}</span>
        </div>
      </div>
      <div className="flex flex-col items-end justify-center flex-shrink-0">
        <div
          className={`text-sm md:text-lg font-bold text-right ${
            isPositive ? "text-green-500" : "text-red-500"
          }`}
        >
          {isPositive ? "+" : ""}{formatAmount(amount)}
        </div>
      </div>
    </div>
  );
}
