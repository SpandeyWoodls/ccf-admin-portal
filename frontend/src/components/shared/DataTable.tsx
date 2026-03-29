import type { LucideIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyState?: { icon: LucideIcon; title: string; description: string };
  onRowClick?: (item: T) => void;
  skeletonRows?: number;
}

function SkeletonRows({
  columns,
  rows,
}: {
  columns: number;
  rows: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <TableRow key={rowIdx}>
          {Array.from({ length: columns }).map((_, colIdx) => (
            <TableCell key={colIdx}>
              <Skeleton
                className="h-4"
                style={{ width: `${55 + ((rowIdx * 7 + colIdx * 13) % 35)}%` }}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  isLoading = false,
  emptyState,
  onRowClick,
  skeletonRows = 5,
}: DataTableProps<T>) {
  const isEmpty = !isLoading && data.length === 0;

  if (isEmpty) {
    const emptyIcon = emptyState?.icon ?? Inbox;
    const emptyTitle = emptyState?.title ?? "No data";
    const emptyDescription =
      emptyState?.description ?? "There are no items to display.";

    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {isLoading ? (
            <SkeletonRows
              columns={columns.length}
              rows={skeletonRows}
            />
          ) : (
            data.map((item, idx) => (
              <TableRow
                key={(item.id as string | number) ?? idx}
                className={cn(
                  onRowClick &&
                    "cursor-pointer hover:bg-[hsl(var(--muted)/0.7)]"
                )}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render
                      ? col.render(item)
                      : (item[col.key] as React.ReactNode) ?? "\u2014"}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
