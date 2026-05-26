/**
 * FilterSidebar — provider, category and module filters using shadcn sidebar
 * primitives from the radix-sera preset (menuColor / menuAccent).
 */

"use client";

import * as React from "react";

import {
  IconSearch,
  IconFolderOpen,
  IconCubeUnfolded,
  IconCategory,
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

  onClear: () => void;
  activeCount: number;
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
              value={props.search}
              onChange={(e) => props.onSearchChange(e.target.value)}
              placeholder="Search address, type, tag…"
              className="pl-8"
              aria-label="Search resources"
            />
          </div>
          <div className="flex items-center justify-between px-1">
            <Label>Filters</Label>
            {props.activeCount > 0 ? (
              <Button variant="link" size="xs" onClick={props.onClear}>
                Clear {props.activeCount}
              </Button>
            ) : null}
          </div>
        </SidebarHeader>

        <SidebarContent>
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
                  <span>{f.label}</span>
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
