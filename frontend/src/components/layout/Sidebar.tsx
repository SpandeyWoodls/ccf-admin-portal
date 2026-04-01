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
  Users,
  Settings,
  ChevronLeft,
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
      { label: "Users", href: "/users", icon: Users, requiredPermission: "settings.team" },
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
          "fixed left-0 top-0 z-40 h-screen border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] flex flex-col transition-all duration-300 ease-in-out",
          collapsed ? "w-16" : "w-[260px]"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex h-[60px] items-center border-b border-[hsl(var(--border))] shrink-0",
          collapsed ? "justify-center px-2" : "gap-3 px-4"
        )}>
          <img
            src="/logo.png"
            alt="Cyber Chakra"
            className="h-9 w-9 shrink-0 rounded-full object-contain"
          />
          <div className={cn(
            "flex flex-col overflow-hidden transition-all duration-300",
            collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
          )}>
            <span className="text-sm font-bold tracking-tight text-[hsl(var(--foreground))] whitespace-nowrap">
              Cyber Chakra
            </span>
            <span className="text-[10px] text-[hsl(var(--muted-foreground))] whitespace-nowrap">
              Admin Portal
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          <div className="space-y-6">
            {filteredNavigation.map((section) => (
              <div key={section.title}>
                {/* Section header */}
                <div className={cn(
                  "mb-2 overflow-hidden transition-all duration-300",
                  collapsed ? "h-0 opacity-0" : "h-auto opacity-100"
                )}>
                  <span className="px-2 text-[10px] font-semibold tracking-[0.15em] text-[hsl(var(--muted-foreground))]/60 uppercase">
                    {section.title}
                  </span>
                </div>
                {collapsed && (
                  <div className="mx-auto mb-2 h-px w-6 bg-[hsl(var(--border))]" />
                )}
                <div className="space-y-0.5">
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
                          "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-all duration-150",
                          isActive
                            ? "bg-[hsl(var(--primary))]/8 text-[hsl(var(--primary))] border-l-2 border-[hsl(var(--primary))] font-medium"
                            : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/50 hover:text-[hsl(var(--foreground))] border-l-2 border-transparent",
                          collapsed && "justify-center px-2 border-l-0",
                          collapsed && isActive && "bg-[hsl(var(--primary))]/8"
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
                        <span className={cn(
                          "flex-1 whitespace-nowrap transition-all duration-300",
                          collapsed ? "w-0 overflow-hidden opacity-0" : "w-auto opacity-100"
                        )}>
                          {item.label}
                        </span>
                        {!collapsed && item.badge !== undefined && (
                          <span
                            className={cn(
                              "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold transition-all duration-300",
                              isActive
                                ? "bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]"
                                : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </NavLink>
                    );

                    if (collapsed) {
                      return (
                        <Tooltip key={item.href}>
                          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                          <TooltipContent side="right">
                            <div className="flex items-center gap-2">
                              {item.label}
                              {item.badge !== undefined && (
                                <span className="rounded-full bg-[hsl(var(--primary))]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                                  {item.badge}
                                </span>
                              )}
                            </div>
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

        {/* User section */}
        <div className="border-t border-[hsl(var(--border))] p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-[hsl(var(--muted))]/50 cursor-pointer",
                  collapsed && "justify-center"
                )}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className={cn(
                  "flex flex-col items-start text-left overflow-hidden transition-all duration-300",
                  collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                )}>
                  <span className="text-sm font-medium text-[hsl(var(--foreground))] whitespace-nowrap">
                    {user?.name || "Admin"}
                  </span>
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                    {user?.role || "Super Admin"}
                  </span>
                </div>
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
        </div>

        {/* Collapse toggle at bottom */}
        <button
          onClick={onToggle}
          className="flex items-center justify-center h-10 w-full border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50 transition-colors cursor-pointer shrink-0"
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 text-[hsl(var(--muted-foreground))] transition-transform duration-300",
              collapsed && "rotate-180"
            )}
          />
        </button>
      </aside>
    </TooltipProvider>
  );
}
