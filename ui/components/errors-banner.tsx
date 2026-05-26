/**
 * ErrorsBanner — surfaces the SnapshotError list the engine attaches to
 * partial-success refreshes (e.g. one .tf file failed to parse but the rest
 * loaded fine). We render these inline rather than as a toast so they don't
 * disappear before the user has a chance to act on them.
 */

import { IconAlertTriangle } from "@tabler/icons-react";

import { type SnapshotError } from "@/lib/types";

interface ErrorsBannerProps {
  errors?: SnapshotError[];
}

export function ErrorsBanner({ errors }: ErrorsBannerProps) {
  if (!errors || errors.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <div className="mb-1 flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
        <IconAlertTriangle className="size-4" aria-hidden />
        Snapshot completed with warnings
      </div>
      <ul className="space-y-0.5 text-xs text-amber-700/90 dark:text-amber-200/90">
        {errors.map((e, i) => (
          <li key={i} className="font-mono">
            <span className="opacity-70">[{e.source}]</span> {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
