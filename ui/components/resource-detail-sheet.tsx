"use client";

import * as React from "react";

import {
  IconCopy,
  IconExternalLink,
  IconTerminal2,
} from "@tabler/icons-react";

import { CopyButton } from "@/components/copy-button";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/toast-provider";
import { CloudResourceIcon } from "@/lib/cloud-icons";
import { type Resource, PLAN_ACTION_META } from "@/lib/types";

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center gap-2 text-left">
            <CloudResourceIcon
              provider={resource.category.provider}
              service={resource.category.service}
              resourceType={resource.type}
              className="size-6"
            />
            <SheetTitle className="text-left">{resource.name}</SheetTitle>
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <StatusBadge status={resource.status} />
            {resource.monthly_cost ? (
              <span className="font-mono text-xs text-muted-foreground">
                ${resource.monthly_cost.toFixed(2)}/mo
              </span>
            ) : null}
          </div>

          <Section title="Address">
            <div className="flex items-start gap-1 font-mono text-xs break-all">
              {resource.address}
              <CopyButton value={resource.address} label="Copy address" />
            </div>
          </Section>

          {resource.status_reason ? (
            <Section title="Status reason">{resource.status_reason}</Section>
          ) : null}

          {resource.plan_action ? (
            <Section title="Planned action">
              {PLAN_ACTION_META[resource.plan_action]?.label ?? resource.plan_action}
            </Section>
          ) : null}

          {resource.drift_attributes && resource.drift_attributes.length > 0 ? (
            <Section title="Drifted attributes">
              <div className="flex flex-wrap gap-1">
                {resource.drift_attributes.map((attr) => (
                  <span
                    key={attr}
                    className="rounded-md bg-muted px-2 py-1 font-mono text-[11px]"
                  >
                    {attr}
                  </span>
                ))}
              </div>
            </Section>
          ) : null}

          <Section title="Metadata">
            <DL>
              <Row k="Type" v={resource.type} mono />
              <Row k="Provider" v={resource.category.provider} />
              <Row k="Service" v={resource.category.service} />
              <Row k="Module" v={resource.module || "(root)"} mono />
              {hasLastChanged ? (
                <Row
                  k="Last changed"
                  v={new Date(resource.last_changed!).toLocaleString()}
                />
              ) : null}
            </DL>
          </Section>

          {resource.attributes && Object.keys(resource.attributes).length > 0 ? (
            <Section title="Attributes">
              <DL>
                {Object.entries(resource.attributes).map(([k, v]) => (
                  <Row key={k} k={k} v={v} mono />
                ))}
              </DL>
            </Section>
          ) : null}

          {resource.tags && Object.keys(resource.tags).length > 0 ? (
            <Section title="Tags">
              <div className="flex flex-wrap gap-1">
                {Object.entries(resource.tags).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] hover:bg-muted/80"
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
                  </button>
                ))}
              </div>
            </Section>
          ) : null}

          <Section title="CLI">
            <div className="space-y-2">
              <CodeBlock
                label="Inspect in state"
                value={tfShow}
                onCopy={() => toast("Copied terraform command")}
              />
              <CodeBlock
                label="Target this resource"
                value={`terraform plan -target='${resource.address}'`}
                onCopy={() => toast("Copied target plan command")}
              />
            </div>
          </Section>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={async () => {
                await navigator.clipboard.writeText(resource.address);
                toast("Address copied");
              }}
            >
              <IconCopy className="size-3.5" />
              Copy address
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              asChild
            >
              <a
                href={`https://registry.terraform.io/search/providers?q=${encodeURIComponent(resource.type)}`}
                target="_blank"
                rel="noreferrer"
              >
                <IconExternalLink className="size-3.5" />
                Docs
              </a>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function DL({ children }: { children: React.ReactNode }) {
  return <dl className="space-y-1.5">{children}</dl>;
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-xs">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={mono ? "font-mono break-all" : "break-words"}>{v}</dd>
    </div>
  );
}

function CodeBlock({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-md border bg-muted/40 p-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <IconTerminal2 className="size-3" />
          {label}
        </span>
        <CopyButton value={value} label={`Copy ${label}`} />
      </div>
      <pre
        className="overflow-x-auto font-mono text-[11px] whitespace-pre-wrap"
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
