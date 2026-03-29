import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  KeyRound,
  FlaskConical,
  BarChart3,
  Package,
  Megaphone,
  LifeBuoy,
  ScrollText,
  Settings,
  Search,
  ArrowRight,
  CornerDownLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Command definitions
// ---------------------------------------------------------------------------

interface Command {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  section: "Navigation" | "Actions";
  keywords?: string[];
}

const COMMANDS: Command[] = [
  { id: "dashboard", label: "Go to Dashboard", icon: LayoutDashboard, path: "/dashboard", section: "Navigation", keywords: ["home", "overview"] },
  { id: "licenses", label: "Go to Licenses", icon: KeyRound, path: "/licenses", section: "Navigation", keywords: ["keys", "activation"] },
  { id: "organizations", label: "Go to Organizations", icon: Building2, path: "/organizations", section: "Navigation", keywords: ["orgs", "clients", "agencies"] },
  { id: "trials", label: "Go to Trial Requests", icon: FlaskConical, path: "/trials", section: "Navigation", keywords: ["demo", "evaluation"] },
  { id: "analytics", label: "Go to Analytics", icon: BarChart3, path: "/analytics", section: "Navigation", keywords: ["stats", "metrics", "reports"] },
  { id: "releases", label: "Go to Releases", icon: Package, path: "/releases", section: "Navigation", keywords: ["versions", "updates", "deploy"] },
  { id: "announcements", label: "Go to Announcements", icon: Megaphone, path: "/announcements", section: "Navigation", keywords: ["notices", "news"] },
  { id: "support", label: "Go to Support Tickets", icon: LifeBuoy, path: "/support", section: "Navigation", keywords: ["help", "tickets", "issues"] },
  { id: "audit", label: "Go to Audit Log", icon: ScrollText, path: "/audit", section: "Navigation", keywords: ["logs", "history", "trail"] },
  { id: "settings", label: "Go to Settings", icon: Settings, path: "/settings", section: "Navigation", keywords: ["preferences", "config"] },
  { id: "new-license", label: "Create New License", icon: KeyRound, path: "/licenses?action=new", section: "Actions", keywords: ["add license", "generate key"] },
  { id: "new-org", label: "Create New Organization", icon: Building2, path: "/organizations?action=new", section: "Actions", keywords: ["add organization", "add client"] },
  { id: "new-release", label: "Create New Release", icon: Package, path: "/releases?action=new", section: "Actions", keywords: ["publish", "deploy version"] },
  { id: "new-announcement", label: "Create New Announcement", icon: Megaphone, path: "/announcements?action=new", section: "Actions", keywords: ["post", "notify"] },
];

// ---------------------------------------------------------------------------
// Fuzzy match helper — returns indices of matched chars or null
// ---------------------------------------------------------------------------

function fuzzyMatch(text: string, query: string): number[] | null {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const indices: number[] = [];
  let qi = 0;

  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) {
      indices.push(ti);
      qi++;
    }
  }

  return qi === lowerQuery.length ? indices : null;
}

// ---------------------------------------------------------------------------
// Highlighted label component
// ---------------------------------------------------------------------------

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <span>{text}</span>;

  const indexSet = new Set(indices);
  const parts: React.ReactNode[] = [];
  let currentRun = "";
  let currentIsHighlighted = false;

  for (let i = 0; i < text.length; i++) {
    const isHighlighted = indexSet.has(i);
    if (i === 0) {
      currentIsHighlighted = isHighlighted;
      currentRun = text[i];
    } else if (isHighlighted === currentIsHighlighted) {
      currentRun += text[i];
    } else {
      parts.push(
        currentIsHighlighted ? (
          <span key={i} className="text-[hsl(var(--primary))] font-semibold">
            {currentRun}
          </span>
        ) : (
          <span key={i}>{currentRun}</span>
        )
      );
      currentRun = text[i];
      currentIsHighlighted = isHighlighted;
    }
  }

  // Flush last run
  parts.push(
    currentIsHighlighted ? (
      <span key="last" className="text-[hsl(var(--primary))] font-semibold">
        {currentRun}
      </span>
    ) : (
      <span key="last">{currentRun}</span>
    )
  );

  return <>{parts}</>;
}

// ---------------------------------------------------------------------------
// CommandPalette
// ---------------------------------------------------------------------------

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------------------
  // Filter & group commands
  // -----------------------------------------------------------------------

  const filtered = useMemo(() => {
    if (!query.trim()) return COMMANDS;

    const results: { command: Command; indices: number[] }[] = [];

    for (const cmd of COMMANDS) {
      const labelMatch = fuzzyMatch(cmd.label, query);
      if (labelMatch) {
        results.push({ command: cmd, indices: labelMatch });
        continue;
      }

      // Also match on keywords
      if (cmd.keywords?.some((kw) => fuzzyMatch(kw, query) !== null)) {
        results.push({ command: cmd, indices: [] });
      }
    }

    return results.map((r) => ({ ...r.command, _indices: r.indices }));
  }, [query]);

  // Build flat list + section metadata
  const { flatList, sections } = useMemo(() => {
    const sectionOrder: Command["section"][] = ["Navigation", "Actions"];
    const grouped = new Map<string, (Command & { _indices?: number[] })[]>();

    for (const cmd of filtered) {
      const section = (cmd as any).section as string;
      if (!grouped.has(section)) grouped.set(section, []);
      grouped.get(section)!.push(cmd as any);
    }

    const flatList: (Command & { _indices?: number[] })[] = [];
    const sections: { label: string; startIndex: number }[] = [];

    for (const section of sectionOrder) {
      const items = grouped.get(section);
      if (!items || items.length === 0) continue;
      sections.push({ label: section, startIndex: flatList.length });
      flatList.push(...items);
    }

    return { flatList, sections };
  }, [filtered]);

  // -----------------------------------------------------------------------
  // Reset state when opened / closed
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Focus the input after the animation frame
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Clamp selected index when results change
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, flatList.length - 1)));
  }, [flatList.length]);

  // -----------------------------------------------------------------------
  // Execute a command
  // -----------------------------------------------------------------------

  const execute = useCallback(
    (command: Command) => {
      onOpenChange(false);
      navigate(command.path);
    },
    [navigate, onOpenChange]
  );

  // -----------------------------------------------------------------------
  // Keyboard handler
  // -----------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < flatList.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : flatList.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (flatList[selectedIndex]) {
            execute(flatList[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    },
    [flatList, selectedIndex, execute, onOpenChange]
  );

  // -----------------------------------------------------------------------
  // Scroll selected item into view
  // -----------------------------------------------------------------------

  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const selectedEl = listEl.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[min(20vh,160px)]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-150"
        onClick={() => onOpenChange(false)}
      />

      {/* Palette */}
      <div
        className="relative z-10 w-full max-w-[560px] mx-4 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--popover))] shadow-2xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-4">
          <Search className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent py-3.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] outline-none"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-1.5 font-mono text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[min(50vh,360px)] overflow-y-auto overscroll-contain p-2"
        >
          {flatList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.4)] mb-3" />
              <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
                No results found
              </p>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground)/0.6)]">
                Try a different search term
              </p>
            </div>
          ) : (
            sections.map((section) => {
              // Collect items belonging to this section
              const nextSection = sections.find(
                (s) => s.startIndex > section.startIndex
              );
              const endIndex = nextSection
                ? nextSection.startIndex
                : flatList.length;
              const items = flatList.slice(section.startIndex, endIndex);

              return (
                <div key={section.label} className="mb-1 last:mb-0">
                  {/* Section header */}
                  <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                    {section.label}
                  </div>

                  {/* Items */}
                  {items.map((cmd, localIdx) => {
                    const globalIdx = section.startIndex + localIdx;
                    const isSelected = globalIdx === selectedIndex;
                    const Icon = cmd.icon;
                    const indices = (cmd as any)._indices as
                      | number[]
                      | undefined;

                    return (
                      <button
                        key={cmd.id}
                        data-index={globalIdx}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-75 cursor-pointer",
                          isSelected
                            ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
                            : "text-[hsl(var(--popover-foreground))] hover:bg-[hsl(var(--accent)/0.5)]"
                        )}
                        onClick={() => execute(cmd)}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors duration-75",
                            isSelected
                              ? "border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]"
                              : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] text-[hsl(var(--muted-foreground))]"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>

                        <span className="flex-1 truncate">
                          {indices && indices.length > 0 ? (
                            <HighlightedText
                              text={cmd.label}
                              indices={indices}
                            />
                          ) : (
                            cmd.label
                          )}
                        </span>

                        <ArrowRight
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-all duration-75",
                            isSelected
                              ? "opacity-100 translate-x-0 text-[hsl(var(--muted-foreground))]"
                              : "opacity-0 -translate-x-1"
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer hints */}
        {flatList.length > 0 && (
          <div className="flex items-center gap-4 border-t border-[hsl(var(--border))] px-4 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
              <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-1 font-mono text-[10px]">
                &uarr;
              </kbd>
              <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-1 font-mono text-[10px]">
                &darr;
              </kbd>
              <span>navigate</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
              <kbd className="inline-flex h-[18px] items-center justify-center rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-1 font-mono text-[10px]">
                <CornerDownLeft className="h-2.5 w-2.5" />
              </kbd>
              <span>select</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
              <kbd className="inline-flex h-[18px] items-center justify-center rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-1 font-mono text-[10px]">
                esc
              </kbd>
              <span>close</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
