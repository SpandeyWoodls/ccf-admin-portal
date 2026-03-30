import { useState, useEffect, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ProtectedRoute } from "./ProtectedRoute";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { cn } from "@/lib/utils";

export function DashboardLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const location = useLocation();
  const [pageKey, setPageKey] = useState(location.pathname);

  // Trigger fade-in on route change
  useEffect(() => {
    setPageKey(location.pathname);
  }, [location.pathname]);

  // Auto-collapse sidebar on screens narrower than 1280px
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1279px)");
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setSidebarCollapsed(e.matches);
    };
    // Set initial state
    handleChange(mql);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  // Global keyboard shortcut: Cmd+K (Mac) / Ctrl+K (Windows)
  const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setCommandPaletteOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden">
        {/* Mobile overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar - hidden on mobile unless toggled */}
        <div
          className={cn(
            "fixed z-40 lg:relative lg:block",
            mobileMenuOpen ? "block" : "hidden lg:block"
          )}
        >
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>

        {/* Main content */}
        <div
          className={cn(
            "flex flex-1 flex-col overflow-hidden transition-all duration-300",
            sidebarCollapsed ? "lg:ml-16" : "lg:ml-[260px]"
          )}
        >
          <Topbar
            onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
            onSearchClick={() => setCommandPaletteOpen(true)}
          />

          <main className="flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,hsl(var(--muted)/0.3)_0%,transparent_70%)]">
            <div key={pageKey} className="mx-auto max-w-[1400px] px-6 py-5 page-fade-in">
              <Outlet />
            </div>
          </main>
        </div>

        {/* Command Palette */}
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
        />
      </div>
    </ProtectedRoute>
  );
}
