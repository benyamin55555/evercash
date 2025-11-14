import { Button } from "@/components/ui/button";
import { useSimpleCurrency } from "@/contexts/SimpleCurrencyContext";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface DemoBannerProps {
  netWorth?: number;
  txCount?: number;
  onExit: () => void;
}

export function DemoBanner({ netWorth, txCount, onExit }: DemoBannerProps) {
  const { formatAmount } = useSimpleCurrency();
  const [isExiting, setIsExiting] = useState(false);
  
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
        <Button 
          size="sm" 
          variant="outline" 
          disabled={isExiting}
          onClick={() => {
            console.log('🚪 DemoBanner: Exit demo button clicked');
            setIsExiting(true);
            
            try {
              onExit();
            } catch (e) {
              console.error('Exit demo failed:', e);
            }
            
            // Immediate reload attempt
            setTimeout(() => {
              console.log('🚪 DemoBanner: Immediate reload');
              window.location.reload();
            }, 100);
            
            // Aggressive fallback - if nothing happens in 1 second, force reload
            setTimeout(() => {
              console.log('🚪 DemoBanner: Fallback reload triggered');
              window.location.href = window.location.href;
            }, 1000);
          }}
        >
          {isExiting ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
              Exiting...
            </>
          ) : (
            'Exit demo'
          )}
        </Button>
      </div>
    </div>
  );
}
