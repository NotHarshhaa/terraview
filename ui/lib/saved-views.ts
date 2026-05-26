/**
 * Persist named filter views in localStorage.
 */

const STORAGE_KEY = "terraview_saved_views";

export interface SavedView {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}

export function loadSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedView[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveView(name: string, query: string): SavedView[] {
  const views = loadSavedViews();
  const view: SavedView = {
    id: crypto.randomUUID(),
    name: name.trim(),
    query,
    createdAt: new Date().toISOString(),
  };
  const next = [view, ...views].slice(0, 12);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteView(id: string): SavedView[] {
  const next = loadSavedViews().filter((v) => v.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
