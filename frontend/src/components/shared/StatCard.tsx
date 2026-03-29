import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  color?: "default" | "success" | "warning" | "destructive";
  isLoading?: boolean;
}

const colorMap = {
  default: {
    bg: "bg-[hsl(var(--primary)/0.1)]",
    text: "text-[hsl(var(--primary))]",
    border: "hover:border-[hsl(var(--primary)/0.4)]",
  },
  success: {
    bg: "bg-[hsl(var(--success)/0.1)]",
    text: "text-[hsl(var(--success))]",
    border: "hover:border-[hsl(var(--success)/0.4)]",
  },
  warning: {
    bg: "bg-[hsl(var(--warning)/0.1)]",
    text: "text-[hsl(var(--warning))]",
    border: "hover:border-[hsl(var(--warning)/0.4)]",
  },
  destructive: {
    bg: "bg-[hsl(var(--destructive)/0.1)]",
    text: "text-[hsl(var(--destructive))]",
    border: "hover:border-[hsl(var(--destructive)/0.4)]",
  },
} as const;

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color = "default",
  isLoading = false,
}: StatCardProps) {
  const colors = colorMap[color];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-8 w-20" />
          <Skeleton className="mt-2 h-3.5 w-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "transition-all duration-200 hover:scale-[1.01]",
        colors.border
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
            {title}
          </p>
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              colors.bg
            )}
          >
            <Icon className={cn("h-5 w-5", colors.text)} />
          </div>
        </div>

        <div className="mt-3 flex items-end gap-2">
          <span className="text-2xl font-bold text-[hsl(var(--foreground))]">
            {value}
          </span>

          {trend && (
            <span
              className={cn(
                "mb-0.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold",
                trend.isPositive
                  ? "bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]"
                  : "bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]"
              )}
            >
              {trend.isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {trend.value}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
