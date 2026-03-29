import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius)] border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] px-6 py-16 text-center",
        className
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--muted))]">
        <Icon className="h-7 w-7 text-[hsl(var(--muted-foreground))]" />
      </div>

      <h3 className="mt-4 text-lg font-semibold text-[hsl(var(--foreground))]">
        {title}
      </h3>

      <p className="mt-1.5 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">
        {description}
      </p>

      {action && (
        <Button className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
