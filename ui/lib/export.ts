/**
 * Export filtered resources as JSON or CSV downloads.
 */

import type { Resource } from "@/lib/types";

interface ExportMeta {
  generatedAt?: string;
  workingDir?: string;
  filterSummary?: string;
}

export function downloadJSON(resources: Resource[], meta: ExportMeta) {
  const payload = {
    exported_at: new Date().toISOString(),
    generated_at: meta.generatedAt,
    working_dir: meta.workingDir,
    filter: meta.filterSummary,
    count: resources.length,
    resources,
  };
  downloadBlob(
    JSON.stringify(payload, null, 2),
    "application/json",
    filename("json"),
  );
}

export function downloadCSV(resources: Resource[], meta: ExportMeta) {
  const cols = [
    "address",
    "name",
    "type",
    "provider",
    "service",
    "module",
    "status",
    "status_reason",
    "monthly_cost",
    "last_changed",
  ] as const;

  const lines = [cols.join(",")];
  for (const r of resources) {
    lines.push(
      cols
        .map((c) => {
          switch (c) {
            case "provider":
              return csvCell(r.category.provider);
            case "service":
              return csvCell(r.category.service);
            default:
              return csvCell(String(r[c] ?? ""));
          }
        })
        .join(","),
    );
  }

  const header = meta.filterSummary
    ? `# filter: ${meta.filterSummary}\n# working_dir: ${meta.workingDir ?? ""}\n`
    : "";
  downloadBlob(header + lines.join("\n"), "text/csv", filename("csv"));
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function filename(ext: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `terraview-export-${stamp}.${ext}`;
}

function downloadBlob(content: string, mime: string, name: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
