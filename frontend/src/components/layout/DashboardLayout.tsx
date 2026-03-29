import { useState, useEffect, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ProtectedRoute } from "./ProtectedRoute";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { cn } from "@/lib/utils";

export function DashboardLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

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
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
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

          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1400px] p-6">
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
