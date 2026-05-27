"use client";

import * as React from "react";

import {
  IconBolt,
  IconBookmark,
  IconCategory,
  IconCubeUnfolded,
  IconFolderOpen,
  IconSearch,
  IconTag,
  IconX,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CloudServiceIcon } from "@/lib/cloud-icons";
import { QUICK_PRESETS } from "@/lib/views";
import type { SavedView } from "@/lib/saved-views";

export interface Facet {
  value: string;
  label: string;
  count: number;
  /** Dominant provider for category facets (drives service icon). */
  iconProvider?: string;
}

interface FilterSidebarProps {
  search: string;
  onSearchChange: (value: string) => void;

  providers: Facet[];
  activeProviders: Set<string>;
  onProviderToggle: (value: string) => void;

  categories: Facet[];
  activeCategories: Set<string>;
  onCategoryToggle: (value: string) => void;

  modules: Facet[];
  activeModules: Set<string>;
  onModuleToggle: (value: string) => void;

  tags: Facet[];
  activeTags: Set<string>;
  onTagToggle: (value: string) => void;

  onClear: () => void;
  activeCount: number;

  onApplyPreset: (presetId: string) => void;
  savedViews: SavedView[];
  onApplySavedView: (view: SavedView) => void;
  onSaveCurrentView: () => void;
  onDeleteSavedView: (id: string) => void;
}

export function FilterSidebar(props: FilterSidebarProps) {
  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="none" className="h-full w-full border-r bg-card/30">
        <SidebarHeader className="gap-3 border-b pb-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="font-heading text-xs font-semibold tracking-wider uppercase">
              Filters
            </span>
            <div className="flex items-center gap-1.5">
              {props.activeCount > 0 ? (
                <>
                  <Badge variant="outline" className="normal-case tabular-nums">
                    {props.activeCount} active
                  </Badge>
                  <Button variant="link" size="xs" onClick={props.onClear}>
                    Clear
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <div className="relative">
            <IconSearch
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <SidebarInput
              id="resource-search"
              value={props.search}
              onChange={(e) => props.onSearchChange(e.target.value)}
              placeholder="Search address, type, tag…"
              className="h-9 border bg-background/60 pl-8 pr-8"
              aria-label="Search resources"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-sm border bg-muted px-1 font-mono text-[10px] text-muted-foreground sm:inline">
              /
            </kbd>
          </div>
        </SidebarHeader>

        <SidebarContent className="gap-0 overflow-hidden">
          <ScrollArea className="h-full [&>[data-slot=scroll-area-viewport]>div]:!block">
            <SidebarGroup>
              <SidebarGroupLabel className="gap-1.5">
                <IconBolt className="size-3.5" aria-hidden />
                Quick filters
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="flex flex-wrap gap-1.5 px-1">
                  {QUICK_PRESETS.map((preset) => (
                    <Tooltip key={preset.id}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="xs"
                          className="h-7 normal-case"
                          onClick={() => props.onApplyPreset(preset.id)}
                        >
                          {preset.label}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {preset.description}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />

            <SidebarGroup>
              <SidebarGroupLabel className="justify-between pr-1">
                <span className="inline-flex items-center gap-1.5">
                  <IconBookmark className="size-3.5" aria-hidden />
                  Saved views
                  {props.savedViews.length > 0 ? (
                    <Badge variant="ghost" className="normal-case tabular-nums">
                      {props.savedViews.length}
                    </Badge>
                  ) : null}
                </span>
                <Button variant="link" size="xs" onClick={props.onSaveCurrentView}>
                  Save
                </Button>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                {props.savedViews.length === 0 ? (
                  <EmptyHint>
                    Save the current filters for quick access.
                  </EmptyHint>
                ) : (
                  <SidebarMenu>
                    {props.savedViews.map((view) => (
                      <SidebarMenuItem key={view.id} className="group/view">
                        <SidebarMenuButton
                          onClick={() => props.onApplySavedView(view)}
                          className="pr-9"
                        >
                          <IconBookmark
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <span className="truncate">{view.name}</span>
                        </SidebarMenuButton>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/view:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                props.onDeleteSavedView(view.id);
                              }}
                              aria-label={`Delete ${view.name}`}
                            >
                              <IconX className="size-3.5" aria-hidden />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">Delete view</TooltipContent>
                        </Tooltip>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                )}
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />

            <FacetGroup
              icon={<IconCubeUnfolded className="size-3.5" aria-hidden />}
              label="Providers"
              facets={props.providers}
              active={props.activeProviders}
              onToggle={props.onProviderToggle}
              iconMode="provider"
            />
            <SidebarSeparator />
            <FacetGroup
              icon={<IconCategory className="size-3.5" aria-hidden />}
              label="Categories"
              facets={props.categories}
              active={props.activeCategories}
              onToggle={props.onCategoryToggle}
              iconMode="category"
            />
            <SidebarSeparator />
            <FacetGroup
              icon={<IconFolderOpen className="size-3.5" aria-hidden />}
              label="Modules"
              facets={props.modules}
              active={props.activeModules}
              onToggle={props.onModuleToggle}
              emptyLabel="No modules in this project"
            />
            {props.tags.length > 0 ? (
              <>
                <SidebarSeparator />
                <FacetGroup
                  icon={<IconTag className="size-3.5" aria-hidden />}
                  label="Tags"
                  facets={props.tags}
                  active={props.activeTags}
                  onToggle={props.onTagToggle}
                  iconMode="tag"
                  emptyLabel="No tags found"
                />
              </>
            ) : null}
          </ScrollArea>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-1 border border-dashed px-3 py-4 text-center text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

interface FacetGroupProps {
  icon: React.ReactNode;
  label: string;
  facets: Facet[];
  active: Set<string>;
  onToggle: (value: string) => void;
  emptyLabel?: string;
  iconMode?: "provider" | "category" | "tag";
}

function FacetGroup({
  icon,
  label,
  facets,
  active,
  onToggle,
  emptyLabel = "Nothing yet",
  iconMode,
}: FacetGroupProps) {
  const activeInGroup = facets.filter((f) => active.has(f.value)).length;

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="gap-1.5">
        {icon}
        {label}
        {facets.length > 0 ? (
          <Badge variant="ghost" className="normal-case tabular-nums">
            {facets.length}
          </Badge>
        ) : null}
        {activeInGroup > 0 ? (
          <Badge variant="secondary" className="ml-auto normal-case tabular-nums">
            {activeInGroup} on
          </Badge>
        ) : null}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        {facets.length === 0 ? (
          <EmptyHint>{emptyLabel}</EmptyHint>
        ) : (
          <SidebarMenu>
            {facets.map((f) => {
              const isActive = active.has(f.value);
              return (
                <SidebarMenuItem key={f.value}>
                  <SidebarMenuButton
                    isActive={isActive}
                    onClick={() => onToggle(f.value)}
                    aria-pressed={isActive}
                    className="gap-2"
                  >
                    <FacetIcon facet={f} mode={iconMode} />
                    <span className="min-w-0 flex-1 truncate">{f.label}</span>
                    <Badge
                      variant={isActive ? "default" : "outline"}
                      className="shrink-0 normal-case tabular-nums"
                    >
                      {f.count}
                    </Badge>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function FacetIcon({
  facet,
  mode,
}: {
  facet: Facet;
  mode?: FacetGroupProps["iconMode"];
}) {
  if (mode === "provider") {
    return <CloudServiceIcon provider={facet.value} className="size-4 shrink-0" />;
  }
  if (mode === "category") {
    return (
      <CloudServiceIcon
        provider={facet.iconProvider ?? "AWS"}
        service={facet.value}
        className="size-4 shrink-0"
      />
    );
  }
  if (mode === "tag") {
    return <IconTag className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />;
  }
  return <IconFolderOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />;
}
