import { ShieldX } from "lucide-react";

export function AccessDenied() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center">
        <ShieldX className="h-12 w-12 mx-auto mb-4 text-[hsl(var(--muted-foreground))]" />
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Access Denied</h2>
        <p className="text-[hsl(var(--muted-foreground))] mt-1">
          You don't have permission to view this page.
        </p>
      </div>
    </div>
  );
}
