export type SearchScope =
  | "cities"
  | "planning:records"
  | "target:species"
  | `${"national" | "city" | "target"}:places`;
export const SEARCH_HISTORY_LIMIT = 10;
export const SEARCH_TERM_LIMIT = 80;
const prefix = "bird:search-history:v1:";
const sessionOnly = new Map<SearchScope, string[]>();

export function normalizeSearchTerm(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, SEARCH_TERM_LIMIT);
}

function validHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter((item): item is string => typeof item === "string")
    .map(normalizeSearchTerm)
    .filter((term) => {
      const key = term.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SEARCH_HISTORY_LIMIT);
}

export function readSearchHistory(scope: SearchScope): string[] {
  if (sessionOnly.has(scope)) return sessionOnly.get(scope)!;
  try {
    return validHistory(
      JSON.parse(localStorage.getItem(prefix + scope) ?? "[]"),
    );
  } catch {
    return [];
  }
}

function save(scope: SearchScope, terms: string[]): string[] {
  try {
    localStorage.setItem(prefix + scope, JSON.stringify(terms));
    sessionOnly.delete(scope);
  } catch {
    sessionOnly.set(scope, terms);
  }
  return terms;
}

export function rememberSearch(scope: SearchScope, text: string): string[] {
  const term = normalizeSearchTerm(text);
  return term
    ? save(scope, validHistory([term, ...readSearchHistory(scope)]))
    : readSearchHistory(scope);
}

export function deleteSearch(scope: SearchScope, term: string): string[] {
  return save(
    scope,
    readSearchHistory(scope).filter(
      (item) => item.toLocaleLowerCase() !== term.toLocaleLowerCase(),
    ),
  );
}

export function clearSearchHistory(scope: SearchScope): string[] {
  return save(scope, []);
}
