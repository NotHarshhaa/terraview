"use client";

import * as React from "react";

import { IconCopy, IconCheck } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
  mono?: boolean;
}

export function CopyButton({
  value,
  label = "Copy",
  className,
  mono,
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("shrink-0", className)}
      onClick={copy}
      aria-label={label}
      title={label}
    >
      {copied ? (
        <IconCheck className="size-3.5 text-emerald-500" aria-hidden />
      ) : (
        <IconCopy className="size-3.5" aria-hidden />
      )}
      {mono ? (
        <span className="sr-only">{value}</span>
      ) : null}
    </Button>
  );
}

interface CopyTextProps {
  value: string;
  className?: string;
  mono?: boolean;
}

export function CopyText({ value, className, mono }: CopyTextProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <span className={cn("min-w-0 truncate", mono && "font-mono")}>{value}</span>
      <CopyButton value={value} mono={mono} />
    </div>
  );
}
