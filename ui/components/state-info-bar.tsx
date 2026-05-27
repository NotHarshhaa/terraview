"use client";

import { IconDatabase } from "@tabler/icons-react";

interface StateInfoBarProps {
  backendType?: string;
  stateSerial?: number;
  stateModifiedAt?: string;
}

export function StateInfoBar({
  backendType,
  stateSerial,
  stateModifiedAt,
}: StateInfoBarProps) {
  if (!stateSerial && !stateModifiedAt) return null;

  const modified =
    stateModifiedAt && !stateModifiedAt.startsWith("0001-01-01")
      ? new Date(stateModifiedAt).toLocaleString()
      : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1 font-medium text-foreground">
        <IconDatabase className="size-3.5" aria-hidden />
        State
      </span>
      {backendType ? <span>backend: {backendType}</span> : null}
      {stateSerial ? <span>serial: {stateSerial}</span> : null}
      {modified ? <span>modified: {modified}</span> : null}
    </div>
  );
}
