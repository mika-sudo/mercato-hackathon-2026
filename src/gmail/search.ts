import type { Folder } from "../shared/contracts";

export function quotedLabel(label: string): string {
  // Gmail search syntax is not URL encoding. The Router encodes the whole query.
  if (/[\u0000-\u001f\u007f]/.test(label)) throw new Error("Invalid Gmail label");
  return `label:"${label.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Top-level whitespace-separated terms. Null when quotes or groups are unbalanced. */
export function searchTerms(query: string): string[] | null {
  const terms: string[] = [];
  const groups: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < query.length; i += 1) {
    const char = query[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === "(" || char === "{") groups.push(char);
    if ((char === ")" || char === "}") && groups.pop() !== (char === ")" ? "(" : "{")) return null;
    if (/\s/.test(char) && groups.length === 0) {
      if (i > start) terms.push(query.slice(start, i));
      start = i + 1;
    }
  }
  if (quoted || escaped || groups.length) return null;
  if (start < query.length) terms.push(query.slice(start));
  return terms;
}

function labelFromTerm(term: string): string | null {
  const match = /^label:(?:"((?:\\.|[^"])*)"|([^"\s]+))$/i.exec(term);
  return match ? (match[1] ?? match[2] ?? "").replace(/\\(["\\])/g, "$1") : null;
}

/** Gmail also accepts labels with spaces and slashes written as hyphens. */
function sameLabel(a: string, b: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[\s/]+/g, "-");
  return normalize(a) === normalize(b);
}

function folderForTerm(term: string, folders: Folder[]): Folder | null {
  const label = labelFromTerm(term);
  if (!label) return null;
  return folders.find((folder) => folder.gmailLabel && sameLabel(folder.gmailLabel, label)) ?? null;
}

export function folderFromQuery(query: string, folders: Folder[]): Folder | null {
  const terms = searchTerms(query) ?? [];
  for (const term of [...terms].reverse()) {
    const folder = folderForTerm(term, folders);
    if (folder) return folder;
  }
  return null;
}

/** What the user typed: the query without the folder scope we add. */
export function userSearchText(query: string, folders: Folder[]): string {
  const terms = searchTerms(query);
  if (!terms) return query;
  return terms.filter((term) => !folderForTerm(term, folders)).join(" ");
}

export function folderSearchQuery(text: string, folder: Folder | null, folders: Folder[]): string {
  let typed = userSearchText(text.trim(), folders);
  if (folder?.gmailLabel && searchTerms(typed)?.includes("OR")) typed = `(${typed})`;
  const scope = folder?.gmailLabel ? quotedLabel(folder.gmailLabel) : "";
  return [typed, scope].filter(Boolean).join(" ");
}

/** Null when the route cannot be represented as a Gmail search. */
export function routeSearchQuery(routeId: string | null, params: Record<string, string>): string | null {
  if (routeId === "search/:query/:page") return params.query ?? null;
  if (routeId === "label/:labelName/:page" && params.labelName) return quotedLabel(params.labelName);
  const native: Record<string, string> = {
    "all/:page": "",
    "inbox/:page": "in:inbox",
    "sent/:page": "in:sent",
    "drafts/:page": "in:drafts",
    "starred/:page": "is:starred",
    "imp/:page": "is:important",
    "snoozed/:page": "in:snoozed",
    "spam/:page": "in:spam",
    "trash/:page": "in:trash"
  };
  return native[routeId ?? ""] ?? null;
}
