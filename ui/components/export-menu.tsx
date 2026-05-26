"use client";

import * as React from "react";

import { IconDownload, IconLink } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/toast-provider";
import { downloadCSV, downloadJSON } from "@/lib/export";
import type { Resource } from "@/lib/types";

interface ExportMenuProps {
  resources: Resource[];
  generatedAt?: string;
  workingDir?: string;
  filterSummary?: string;
  disabled?: boolean;
}

export function ExportMenu({
  resources,
  generatedAt,
  workingDir,
  filterSummary,
  disabled,
}: ExportMenuProps) {
  const { toast } = useToast();
  const meta = { generatedAt, workingDir, filterSummary };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={disabled || resources.length === 0}
        >
          <IconDownload className="size-3.5" aria-hidden />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            downloadJSON(resources, meta);
            toast(`Exported ${resources.length} resources as JSON`);
          }}
        >
          Download JSON
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            downloadCSV(resources, meta);
            toast(`Exported ${resources.length} resources as CSV`);
          }}
        >
          Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await navigator.clipboard.writeText(window.location.href);
            toast("Link copied to clipboard");
          }}
        >
          <IconLink className="size-3.5" aria-hidden />
          Copy link to this view
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
