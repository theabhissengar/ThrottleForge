export const THEME_KEY = "throttleforge-theme";
export const SIDEBAR_KEY = "throttleforge-sidebar";

export type ThemeChoice = "light" | "dark" | "system";
export type SidebarChoice = "expanded" | "collapsed";
export type ResolvedTheme = "light" | "dark";

export function resolveThemeChoice(raw: string | null): ThemeChoice {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function resolveSidebar(raw: string | null): SidebarChoice {
  if (raw === "expanded" || raw === "collapsed") return raw;
  return "expanded";
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === "dark") return "dark";
  if (choice === "light") return "light";
  return prefersDark ? "dark" : "light";
}

export function readStorage(
  storage: { getItem(key: string): string | null } | null,
  key: string,
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(storage: { setItem(key: string, value: string): void } | null, key: string, value: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Runs before paint. Defaults survive a thrown localStorage or matchMedia call. */
export const BOOT_SCRIPT = `(function(){
  var theme = "system";
  var side = "expanded";
  try {
    var storedTheme = localStorage.getItem("${THEME_KEY}");
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") theme = storedTheme;
    var storedSide = localStorage.getItem("${SIDEBAR_KEY}");
    if (storedSide === "expanded" || storedSide === "collapsed") side = storedSide;
  } catch (e) {}
  var prefersDark = false;
  try { prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) {}
  var resolved = theme === "dark" || (theme === "system" && prefersDark) ? "dark" : "light";
  var root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themeChoice = theme;
  root.dataset.sidebar = side;
  root.style.colorScheme = resolved;
})();`;

export const SIDEBAR_BUTTON_ID = "sidebar-toggle";

/** Copies the saved rail onto the collapse button before hydration. */
export const SIDEBAR_BUTTON_SCRIPT = `(function(){
  var btn = document.getElementById("${SIDEBAR_BUTTON_ID}");
  if (!btn) return;
  var collapsed = document.documentElement.dataset.sidebar === "collapsed";
  btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  btn.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
})();`;

export function applyThemeChoice(choice: ThemeChoice): ResolvedTheme {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveTheme(choice, prefersDark);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themeChoice = choice;
  root.style.colorScheme = resolved;
  writeStorage(window.localStorage, THEME_KEY, choice);
  return resolved;
}

export function applySidebar(choice: SidebarChoice): void {
  document.documentElement.dataset.sidebar = choice;
  writeStorage(window.localStorage, SIDEBAR_KEY, choice);
}
