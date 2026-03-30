import { useEffect, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  KeyRound,
  FlaskConical,
  BarChart3,
  Package,
  Megaphone,
  LifeBuoy,
  Download,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Shield,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useDashboardStore } from "@/stores/dashboardStore";
import { hasPermission, type AdminRole, type Permission } from "@/lib/rbac";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  /** Key used to look up a dynamic badge count from dashboard stats. */
  badgeKey?: string;
  /** If set, the item is only shown when the user has this permission. */
  requiredPermission?: Permission;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, requiredPermission: "dashboard.view" },
    ],
  },
  {
    title: "MANAGEMENT",
    items: [
      { label: "Organizations", href: "/organizations", icon: Building2, badgeKey: "totalOrganizations", requiredPermission: "organizations.view" },
      { label: "Licenses", href: "/licenses", icon: KeyRound, badgeKey: "totalActiveLicenses", requiredPermission: "licenses.view" },
      { label: "Trials", href: "/trials", icon: FlaskConical, badgeKey: "activeTrials", requiredPermission: "trials.view" },
    ],
  },
  {
    title: "INTELLIGENCE",
    items: [
      { label: "Analytics", href: "/analytics", icon: BarChart3, requiredPermission: "analytics.view" },
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      { label: "Releases", href: "/releases", icon: Package, requiredPermission: "releases.view" },
      { label: "Downloads", href: "/downloads", icon: Download, requiredPermission: "downloads.view" },
      { label: "Announcements", href: "/announcements", icon: Megaphone, requiredPermission: "announcements.view" },
      { label: "Support", href: "/support", icon: LifeBuoy, requiredPermission: "support.view" },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { label: "Audit Log", href: "/audit", icon: ScrollText, requiredPermission: "audit.view" },
      { label: "Settings", href: "/settings", icon: Settings, requiredPermission: "settings.view" },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const userRole = (user?.role ?? "") as AdminRole;
  const { stats, fetchStats } = useDashboardStore();

  // Fetch dashboard stats on mount so badge counts reflect real data
  useEffect(() => {
    if (!stats) {
      fetchStats();
    }
  }, [stats, fetchStats]);

  // Build a lookup from badgeKey -> count using live dashboard stats
  const badgeCounts = useMemo<Record<string, number>>(() => {
    if (!stats) return {} as Record<string, number>;
    return {
      totalOrganizations: stats.totalOrganizations,
      totalActiveLicenses: stats.totalActiveLicenses,
      activeTrials: stats.activeTrials,
    };
  }, [stats]);

  // Filter navigation sections & items by the user's role permissions,
  // and resolve dynamic badge counts from dashboard stats.
  const filteredNavigation = navigation
    .map((section) => ({
      ...section,
      items: section.items
        .filter(
          (item) =>
            !item.requiredPermission ||
            hasPermission(userRole, item.requiredPermission),
        )
        .map((item) => {
          if (item.badgeKey && item.badgeKey in badgeCounts) {
            const count = badgeCounts[item.badgeKey];
            // Only show badge when count is a positive number
            return { ...item, badge: count > 0 ? count : undefined };
          }
          return item;
        }),
    }))
    .filter((section) => section.items.length > 0);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "AD";

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-all duration-300 ease-in-out",
          collapsed ? "w-16" : "w-[260px]"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-3 border-b border-[hsl(var(--border))] px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))]">
            <Shield className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-[hsl(var(--foreground))]">
                CCF Admin
              </span>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                Forensics Portal
              </span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-6">
            {filteredNavigation.map((section) => (
              <div key={section.title}>
                {!collapsed && (
                  <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                    {section.title}
                  </div>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive =
                      location.pathname === item.href ||
                      (item.href !== "/dashboard" &&
                        location.pathname.startsWith(item.href));

                    const linkContent = (
                      <NavLink
                        key={item.href}
                        to={item.href}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"
                            : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]",
                          collapsed && "justify-center px-2"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            isActive
                              ? "text-[hsl(var(--primary))]"
                              : "text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]"
                          )}
                        />
                        {!collapsed && (
                          <>
                            <span className="flex-1">{item.label}</span>
                            {item.badge !== undefined && (
                              <span
                                className={cn(
                                  "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
                                  isActive
                                    ? "bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--primary))]"
                                    : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                                )}
                              >
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    );

                    if (collapsed) {
                      return (
                        <Tooltip key={item.href}>
                          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                          <TooltipContent side="right">
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return linkContent;
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Collapse toggle */}
        <Separator />

        {/* User section */}
        <div className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-[hsl(var(--accent))] cursor-pointer",
                  collapsed && "justify-center"
                )}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex flex-col items-start text-left">
                    <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                      {user?.name || "Admin"}
                    </span>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                      {user?.role || "Super Admin"}
                    </span>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user?.name || "Admin"}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {user?.email || "admin@ccf.gov.in"}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logout()}
                className="text-[hsl(var(--destructive))]"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={onToggle}
            className="mt-2 flex w-full items-center justify-center rounded-lg py-1.5 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] cursor-pointer"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
