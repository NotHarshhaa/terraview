"use client";

import {
  IconDatabase,
  IconGitBranch,
  IconHash,
  IconClock,
} from "@tabler/icons-react";

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

  const items = [
    terraformWorkspace && {
      icon: <IconGitBranch className="size-3.5" />,
      label: "Workspace",
      value: terraformWorkspace,
    },
    backendType && {
      icon: provider ? (
        <CloudServiceIcon provider={provider} className="size-3.5" />
      ) : (
        <IconDatabase className="size-3.5" />
      ),
      label: "Backend",
      value: backendType,
    },
    stateSerial !== undefined &&
      stateSerial > 0 && {
        icon: <IconHash className="size-3.5" />,
        label: "Serial",
        value: String(stateSerial),
      },
    modified && {
      icon: <IconClock className="size-3.5" />,
      label: "Modified",
      value: modified,
    },
  ].filter(Boolean) as {
    icon: React.ReactNode;
    label: string;
    value: string;
  }[];

  return (
    <Card className={cn("gap-0 py-0 shadow-sm", className)}>
      <CardContent className="grid grid-cols-2 gap-0 divide-x p-0 sm:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2.5 px-4 py-3"
          >
            <span className="text-muted-foreground">{item.icon}</span>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {item.label}
              </p>
              <p className="truncate font-mono text-xs font-medium">{item.value}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
