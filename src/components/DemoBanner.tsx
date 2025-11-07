import { Button } from "@/components/ui/button";
import { useSimpleCurrency } from "@/contexts/SimpleCurrencyContext";

interface DemoBannerProps {
  netWorth?: number;
  txCount?: number;
  onExit: () => void;
}

export function DemoBanner({ netWorth, txCount, onExit }: DemoBannerProps) {
  const { formatAmount } = useSimpleCurrency();
  return (
    <div className="fixed top-2 right-2 z-50 pointer-events-none">
      <div className="pointer-events-auto rounded-full bg-accent/20 border border-accent/40 backdrop-blur px-3 py-1.5 shadow-sm flex items-center gap-3">
        <div className="text-xs md:text-sm font-medium">
          <span className="mr-2">Demo mode</span>
          {typeof netWorth === 'number' && (
            <span className="mr-3">Net worth: {formatAmount(netWorth)}</span>
          )}
          {typeof txCount === 'number' && (
            <span>Transactions: {txCount}</span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={onExit}>
          Exit demo
        </Button>
      </div>
    </div>
  );
}
