import { LogOut, Moon, Sun } from 'lucide-react';

interface TopTelemetryHeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSignOut: () => void;
  onLogoClick?: () => void;
}

export function TopTelemetryHeader({
  theme,
  onToggleTheme,
  onSignOut,
  onLogoClick,
}: TopTelemetryHeaderProps) {
  return (
    <header className="relative z-20 border-b border-[#111315]/10 dark:border-white/12 bg-[#FAF9F6]/78 dark:bg-[#0B0F17]/78 backdrop-blur-md px-6 lg:px-10 py-4 transition-colors">
      <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onLogoClick}
          className="font-serif text-4xl sm:text-[2.5rem] font-bold tracking-tight leading-none text-[#111315] dark:text-[#F8FAFC] hover:opacity-80 transition-opacity cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#111315] dark:focus-visible:outline-[#F8FAFC]"
        >
          Mistral
        </button>

        <div className="flex items-center gap-2.5">
          <a
            href="/nurse"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center min-h-10 px-3 rounded-full border border-[#111315]/15 dark:border-white/18 bg-[#FFFFFF]/90 dark:bg-[#111827]/90 text-[11px] font-semibold text-[#111315]/75 dark:text-[#F1F5F9]/75 hover:text-[#111315] dark:hover:text-[#F8FAFC] hover:border-[#111315]/35 dark:hover:border-white/35 transition-all duration-300 ease-out"
          >
            Open Nurse Field App ↗
          </a>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Night mode'}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-[#111315]/18 dark:border-white/18 bg-[#FFFFFF]/90 dark:bg-[#111827]/90 text-[#111315] dark:text-[#F8FAFC] hover:bg-[#111315] hover:text-[#FAF9F6] dark:hover:bg-[#F8FAFC] dark:hover:text-[#111315] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111315] dark:focus-visible:outline-[#F8FAFC]"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign Out"
            className="group inline-flex items-center justify-center h-10 rounded-full border border-[#111315]/18 dark:border-white/18 bg-[#FFFFFF]/90 dark:bg-[#111827]/90 text-[#111315] dark:text-[#F8FAFC] hover:bg-[#111315] hover:text-[#FAF9F6] hover:border-[#111315] dark:hover:bg-[#F8FAFC] dark:hover:text-[#111315] dark:hover:border-[#F8FAFC] transition-all duration-200 px-3 hover:px-4 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111315] dark:focus-visible:outline-[#F8FAFC]"
          >
            <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="grid grid-cols-[0fr] group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr] transition-[grid-template-columns] duration-200 overflow-hidden">
              <span className="min-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold pl-0 group-hover:pl-2 group-focus-visible:pl-2 transition-[padding] duration-200">
                Sign Out
              </span>
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
