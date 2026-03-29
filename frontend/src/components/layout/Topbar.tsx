import { useLocation } from "react-router-dom";
import { Search, Bell, Sun, Moon, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/licenses": "Licenses",
  "/organizations": "Organizations",
  "/analytics": "Analytics",
  "/releases": "Releases",
  "/announcements": "Announcements",
  "/support": "Support",
  "/trials": "Trials",
  "/audit": "Audit Log",
  "/settings": "Settings",
};

function getBreadcrumbs(pathname: string): { label: string; href?: string }[] {
  const crumbs: { label: string; href?: string }[] = [{ label: "Home", href: "/dashboard" }];
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length > 0) {
    const mainPath = `/${segments[0]}`;
    const title = routeTitles[mainPath] || segments[0].charAt(0).toUpperCase() + segments[0].slice(1);
    if (segments.length === 1) {
      crumbs.push({ label: title });
    } else {
      crumbs.push({ label: title, href: mainPath });
      crumbs.push({ label: segments[1].toUpperCase().slice(0, 8) + "..." });
    }
  }

  return crumbs;
}

interface TopbarProps {
  onMobileMenuToggle: () => void;
  onSearchClick?: () => void;
}

export function Topbar({ onMobileMenuToggle, onSearchClick }: TopbarProps) {
  const location = useLocation();
  const [isDark, setIsDark] = useState(true);
  const breadcrumbs = getBreadcrumbs(location.pathname);

  // Find the page title
  const segments = location.pathname.split("/").filter(Boolean);
  const mainPath = segments.length > 0 ? `/${segments[0]}` : "/dashboard";
  const pageTitle = routeTitles[mainPath] || "Dashboard";

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/0.8)] px-6 backdrop-blur-md">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMobileMenuToggle}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-sm">
        {breadcrumbs.map((crumb, idx) => (
          <span key={idx} className="flex items-center gap-1.5">
            {idx > 0 && (
              <span className="text-[hsl(var(--muted-foreground))]">/</span>
            )}
            {crumb.href ? (
              <a
                href={crumb.href}
                className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
              >
                {crumb.label}
              </a>
            ) : (
              <span className="font-medium text-[hsl(var(--foreground))]">
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search trigger — opens CommandPalette */}
      <button
        type="button"
        onClick={onSearchClick}
        className="relative hidden h-8 w-64 cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--input))] bg-[hsl(var(--muted))] pl-9 pr-3 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] md:inline-flex"
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="pointer-events-none inline-flex h-5 items-center gap-0.5 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-1.5 font-mono text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
          {navigator.platform?.toLowerCase().includes("mac") ? "\u2318" : "Ctrl+"}K
        </kbd>
      </button>

      <Separator orientation="vertical" className="hidden h-6 md:block" />

      {/* Theme toggle */}
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
        {isDark ? (
          <Sun className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        ) : (
          <Moon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        )}
      </Button>

      {/* Notifications */}
      <Button variant="ghost" size="icon" className="relative h-8 w-8">
        <Bell className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--destructive))] text-[9px] font-bold text-white">
          3
        </span>
      </Button>
    </header>
  );
}
