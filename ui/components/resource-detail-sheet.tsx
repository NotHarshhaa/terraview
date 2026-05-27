"use client";

import * as React from "react";

import {
  IconExternalLink,
  IconInfoCircle,
  IconListDetails,
  IconTag,
  IconTerminal2,
} from "@tabler/icons-react";

import { CopyButton, CopyText } from "@/components/copy-button";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/toast-provider";
import { CloudResourceIcon } from "@/lib/cloud-icons";
import { type Resource, PLAN_ACTION_META } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ResourceDetailSheetProps {
  resource: Resource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilterTag?: (tag: string) => void;
}

export function ResourceDetailSheet({
  resource,
  open,
  onOpenChange,
  onFilterTag,
}: ResourceDetailSheetProps) {
  const { toast } = useToast();
  if (!resource) return null;

  const hasLastChanged =
    !!resource.last_changed && !resource.last_changed.startsWith("0001-01-01");

  const tfShow = `terraform state show '${resource.address}'`;
  const tfTarget = `terraform plan -target='${resource.address}'`;

  const metadataRows: PropertyRow[] = [
    { label: "Type", value: resource.type, mono: true },
    { label: "Provider", value: resource.category.provider },
    { label: "Service", value: resource.category.service },
    { label: "Module", value: resource.module || "(root)", mono: true },
  ];
  if (hasLastChanged) {
    metadataRows.push({
      label: "Last changed",
      value: new Date(resource.last_changed!).toLocaleString(),
    });
  }

  const attributeRows: PropertyRow[] = resource.attributes
    ? Object.entries(resource.attributes).map(([label, value]) => ({
        label,
        value,
        mono: true,
      }))
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="space-y-0 border-b bg-muted/20 p-5 pb-4">
          <div className="flex items-start gap-3 pr-8 text-left">
            <div className="flex size-11 shrink-0 items-center justify-center border bg-background shadow-sm ring-1 ring-foreground/5">
              <CloudResourceIcon
                provider={resource.category.provider}
                service={resource.category.service}
                resourceType={resource.type}
                className="size-5"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <SheetTitle className="text-left text-base font-semibold normal-case tracking-normal">
                  {resource.name}
                </SheetTitle>
                <CopyText
                  value={resource.address}
                  mono
                  className="mt-1.5 text-xs text-muted-foreground"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={resource.status} />
                {resource.plan_action ? (
                  <Badge variant="outline" className="normal-case tracking-normal">
                    {PLAN_ACTION_META[resource.plan_action]?.label ??
                      resource.plan_action}
                  </Badge>
                ) : null}
                {resource.monthly_cost ? (
                  <Badge variant="ghost" className="font-mono normal-case tabular-nums tracking-normal">
                    ${resource.monthly_cost.toFixed(2)}/mo
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 p-5">
            {resource.status_reason ? (
              <DetailSection icon={IconInfoCircle} title="Status reason">
                <p className="border bg-background/60 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
                  {resource.status_reason}
                </p>
              </DetailSection>
            ) : null}

            {resource.drift_attributes && resource.drift_attributes.length > 0 ? (
              <DetailSection icon={IconInfoCircle} title="Drifted attributes">
                <div className="flex flex-wrap gap-1.5">
                  {resource.drift_attributes.map((attr) => (
                    <Badge
                      key={attr}
                      variant="outline"
                      className="border border-border bg-muted/40 px-2 py-1 font-mono normal-case tracking-normal"
                    >
                      {attr}
                    </Badge>
                  ))}
                </div>
              </DetailSection>
            ) : null}

            <DetailSection icon={IconListDetails} title="Metadata">
              <PropertyList rows={metadataRows} />
            </DetailSection>

            {attributeRows.length > 0 ? (
              <DetailSection icon={IconListDetails} title="Attributes">
                <PropertyList rows={attributeRows} />
              </DetailSection>
            ) : null}

            {resource.tags && Object.keys(resource.tags).length > 0 ? (
              <DetailSection icon={IconTag} title="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(resource.tags).map(([k, v]) => (
                    <Tooltip key={k}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="xs"
                          className="h-7 font-mono normal-case tracking-normal"
                          onClick={async () => {
                            const tag = `${k}=${v}`;
                            if (onFilterTag) {
                              onFilterTag(tag);
                              onOpenChange(false);
                              toast(`Filtered by ${tag}`);
                              return;
                            }
                            await navigator.clipboard.writeText(tag);
                            toast(`Copied ${tag}`);
                          }}
                        >
                          {k}={v}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {onFilterTag ? "Filter by this tag" : "Copy tag"}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </DetailSection>
            ) : null}

            <Separator />

            <DetailSection icon={IconTerminal2} title="CLI">
              <div className="divide-y border bg-background/60">
                <CommandSnippet
                  label="Inspect in state"
                  value={tfShow}
                  onCopy={() => toast("Copied terraform command")}
                />
                <CommandSnippet
                  label="Target this resource"
                  value={tfTarget}
                  onCopy={() => toast("Copied target plan command")}
                />
              </div>
            </DetailSection>
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t bg-background p-4 sm:justify-start">
          <Button variant="outline" size="xs" className="normal-case tracking-normal" asChild>
            <a
              href={`https://registry.terraform.io/search/providers?q=${encodeURIComponent(resource.type)}`}
              target="_blank"
              rel="noreferrer"
            >
              <IconExternalLink className="size-3.5" />
              Provider docs
            </a>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

interface PropertyRow {
  label: string;
  value: string;
  mono?: boolean;
}

function DetailSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-1.5 font-heading text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}

function PropertyList({ rows }: { rows: PropertyRow[] }) {
  return (
    <dl className="divide-y border bg-background/60">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[6.75rem_minmax(0,1fr)] gap-x-3 px-3 py-2.5 text-xs"
        >
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className={cn("min-w-0 break-all", row.mono && "font-mono")}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CommandSnippet({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
        <CopyButton value={value} label={`Copy ${label}`} />
      </div>
      <pre
        className="cursor-pointer overflow-x-auto bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/90"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          onCopy();
        }}
      >
        {value}
      </pre>
    </div>
  );
}
