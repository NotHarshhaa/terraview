"use client";

import * as React from "react";

import {
  IconSearch,
  IconFolderOpen,
  IconCubeUnfolded,
  IconCategory,
  IconTag,
  IconBookmark,
  IconBolt,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { QUICK_PRESETS } from "@/lib/views";
import type { SavedView } from "@/lib/saved-views";

export interface Facet {
  value: string;
  label: string;
  count: number;
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
      <Sidebar collapsible="none" className="h-full w-full">
        <SidebarHeader>
          <div className="relative">
            <IconSearch
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <SidebarInput
              id="resource-search"
              value={props.search}
              onChange={(e) => props.onSearchChange(e.target.value)}
              placeholder="Search address, type, tag… (/)"
              className="pl-8"
              aria-label="Search resources"
            />
          </div>
          <div className="flex items-center justify-between px-1">
            <Label htmlFor="resource-search">Filters</Label>
            {props.activeCount > 0 ? (
              <Button variant="link" size="xs" onClick={props.onClear}>
                Clear {props.activeCount}
              </Button>
            ) : null}
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>
              <IconBolt aria-hidden />
              Quick filters
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex flex-wrap gap-1 px-2 pb-1">
                {QUICK_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    variant="outline"
                    size="xs"
                    className="h-7"
                    title={preset.description}
                    onClick={() => props.onApplyPreset(preset.id)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel className="justify-between">
              <span className="inline-flex items-center gap-1">
                <IconBookmark aria-hidden />
                Saved views
              </span>
              <Button variant="link" size="xs" onClick={props.onSaveCurrentView}>
                Save
              </Button>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {props.savedViews.length === 0 ? (
                <p className="px-3 text-xs text-muted-foreground">
                  Save the current filters for quick access.
                </p>
              ) : (
                <SidebarMenu>
                  {props.savedViews.map((view) => (
                    <SidebarMenuItem key={view.id} className="group/view">
                      <SidebarMenuButton onClick={() => props.onApplySavedView(view)}>
                        <span className="truncate pr-6">{view.name}</span>
                      </SidebarMenuButton>
                      <button
                        type="button"
                        className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-1 text-xs text-muted-foreground opacity-0 hover:text-foreground group-hover/view:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onDeleteSavedView(view.id);
                        }}
                        aria-label={`Delete ${view.name}`}
                      >
                        ×
                      </button>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <FacetGroup
            icon={<IconCubeUnfolded aria-hidden />}
            label="Providers"
            facets={props.providers}
            active={props.activeProviders}
            onToggle={props.onProviderToggle}
          />
          <SidebarSeparator />
          <FacetGroup
            icon={<IconCategory aria-hidden />}
            label="Categories"
            facets={props.categories}
            active={props.activeCategories}
            onToggle={props.onCategoryToggle}
          />
          <SidebarSeparator />
          <FacetGroup
            icon={<IconFolderOpen aria-hidden />}
            label="Modules"
            facets={props.modules}
            active={props.activeModules}
            onToggle={props.onModuleToggle}
            emptyLabel="No modules"
          />
          {props.tags.length > 0 ? (
            <>
              <SidebarSeparator />
              <FacetGroup
                icon={<IconTag aria-hidden />}
                label="Tags"
                facets={props.tags}
                active={props.activeTags}
                onToggle={props.onTagToggle}
                emptyLabel="No tags"
              />
            </>
          ) : null}
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}

interface FacetGroupProps {
  icon: React.ReactNode;
  label: string;
  facets: Facet[];
  active: Set<string>;
  onToggle: (value: string) => void;
  emptyLabel?: string;
}

function FacetGroup({
  icon,
  label,
  facets,
  active,
  onToggle,
  emptyLabel = "Nothing yet",
}: FacetGroupProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        {icon}
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        {facets.length === 0 ? (
          <p className="px-3 text-xs text-muted-foreground">{emptyLabel}</p>
        ) : (
          <SidebarMenu>
            {facets.map((f) => (
              <SidebarMenuItem key={f.value}>
                <SidebarMenuButton
                  isActive={active.has(f.value)}
                  onClick={() => onToggle(f.value)}
                  aria-pressed={active.has(f.value)}
                >
                  <span className="truncate">{f.label}</span>
                  <SidebarMenuBadge>{f.count}</SidebarMenuBadge>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
