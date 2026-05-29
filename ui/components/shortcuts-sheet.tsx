"use client";

import * as React from "react";

import { IconKeyboard } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const SHORTCUTS = [
  { keys: ["/", "Ctrl+K"], action: "Focus search / open command palette" },
  { keys: ["r"], action: "Refresh snapshot" },
  { keys: ["j", "k"], action: "Navigate resources down / up" },
  { keys: ["Enter"], action: "Open selected resource details" },
  { keys: ["Esc"], action: "Clear all filters" },
  { keys: ["d"], action: "Toggle light / dark theme" },
  { keys: ["?"], action: "Show keyboard shortcuts" },
];

export function ShortcutsSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Keyboard shortcuts">
          <IconKeyboard className="size-4" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Keyboard shortcuts</SheetTitle>
        </SheetHeader>
        <ul className="mt-4 space-y-3 text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.action} className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">{s.action}</span>
              <span className="flex shrink-0 gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

interface DashboardHotkeysOptions {
  onFocusSearch: () => void;
  onOpenCommand: () => void;
  onRefresh: () => void;
  onClearFilters: () => void;
  onShowShortcuts: () => void;
  onNavigateDown?: () => void;
  onNavigateUp?: () => void;
  onNavigateOpen?: () => void;
}

export function useDashboardHotkeys({
  onFocusSearch,
  onOpenCommand,
  onRefresh,
  onClearFilters,
  onShowShortcuts,
  onNavigateDown,
  onNavigateUp,
  onNavigateOpen,
}: DashboardHotkeysOptions) {
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        onShowShortcuts();
        return;
      }

      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !isTypingTarget(e.target))) {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) onOpenCommand();
        else onFocusSearch();
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onRefresh();
      }
      if (e.key === "Escape") {
        onClearFilters();
      }
      if (e.key === "j" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onNavigateDown?.();
      }
      if (e.key === "k" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onNavigateUp?.();
      }
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        onNavigateOpen?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onFocusSearch, onOpenCommand, onRefresh, onClearFilters, onShowShortcuts, onNavigateDown, onNavigateUp, onNavigateOpen]);
}
