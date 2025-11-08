import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      onClick={toggleTheme}
      variant="outline"
      className={`relative overflow-hidden transition-all duration-300 h-8 md:h-9 lg:h-10 px-2 md:px-2.5 lg:px-3 rounded-md md:rounded-lg ${
        theme === 'dark'
          ? 'bg-gradient-to-r from-[#10B981]/20 to-[#10B981]/30 border-[#10B981]/50 text-[#10B981] hover:bg-[#10B981]/30 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
          : 'bg-gradient-to-r from-[#10B981]/20 to-[#10B981]/30 border-[#10B981]/50 text-black hover:bg-[#10B981]/20 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
      }`}
    >
      <div className="flex items-center gap-1 md:gap-2">
        {theme === 'dark' ? (
          <>
            <Sun className="w-4 h-4 md:w-5 md:h-5" />
            <span className="hidden lg:inline text-xs md:text-sm font-medium">Light</span>
          </>
        ) : (
          <>
            <Moon className="w-4 h-4 md:w-5 md:h-5" />
            <span className="hidden lg:inline text-xs md:text-sm font-medium">Dark</span>
          </>
        )}
      </div>
      
      {/* Animated background indicator */}
      <div
        className={`absolute inset-0 transition-transform duration-300 ${
          theme === 'dark'
            ? 'bg-gradient-to-r from-[#10B981]/10 to-[#10B981]/20 translate-x-0'
            : 'bg-gradient-to-r from-[#10B981]/10 to-[#10B981]/20 translate-x-0'
        }`}
      />
    </Button>
  );
}
