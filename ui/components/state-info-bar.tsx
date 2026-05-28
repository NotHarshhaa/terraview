"use client";

import { IconDatabase } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CloudServiceIcon } from "@/lib/cloud-icons";
import { cn } from "@/lib/utils";

interface StateInfoBarProps {
  backendType?: string;
  stateSerial?: number;
  stateModifiedAt?: string;
  terraformWorkspace?: string;
  className?: string;
}

function backendProviderLabel(backendType: string): string | null {
  switch (backendType.toLowerCase()) {
    case "s3":
      return "AWS";
    case "gcs":
      return "GCP";
    case "azureblob":
    case "azurerm":
      return "Azure";
    default:
      return null;
  }
}

function formatModified(iso?: string): string | null {
  if (!iso || iso.startsWith("0001-01-01")) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function StateInfoBar({
  backendType,
  stateSerial,
  stateModifiedAt,
  terraformWorkspace,
  className,
}: StateInfoBarProps) {
  const modified = formatModified(stateModifiedAt);
  const provider = backendType ? backendProviderLabel(backendType) : null;

  if (!backendType && !stateSerial && !modified && !terraformWorkspace) {
    return null;
  }

  return (
    <Card className={cn("gap-0 py-0 shadow-sm", className)}>
      <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <span className="inline-flex items-center gap-2 font-heading text-xs font-semibold tracking-wider uppercase">
          <span className="flex size-7 items-center justify-center border bg-background shadow-sm ring-1 ring-foreground/5">
            <IconDatabase className="size-3.5 text-muted-foreground" aria-hidden />
          </span>
          State
        </span>

        <Separator orientation="vertical" className="hidden h-5 sm:block" />

        <div className="flex flex-wrap items-center gap-2">
          {terraformWorkspace ? (
            <Badge variant="outline" className="gap-1.5 normal-case">
              workspace
              <span className="font-mono">{terraformWorkspace}</span>
            </Badge>
          ) : null}

          {backendType ? (
            <Badge variant="outline" className="gap-1.5 normal-case">
              {provider ? (
                <CloudServiceIcon provider={provider} className="size-3.5" />
              ) : null}
              backend
              <span className="font-mono">{backendType}</span>
            </Badge>
          ) : null}

          {stateSerial !== undefined && stateSerial > 0 ? (
            <Badge variant="outline" className="gap-1.5 normal-case tabular-nums">
              serial
              <span className="font-mono">{stateSerial}</span>
            </Badge>
          ) : null}

          {modified ? (
            <Badge variant="secondary" className="gap-1.5 normal-case">
              modified
              <span className="font-mono text-[11px]">{modified}</span>
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
