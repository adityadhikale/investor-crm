export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "crm-theme";

/**
 * Runs in <head> before first paint so the page never flashes the wrong
 * theme. Keep in sync with ThemeProvider: no saved choice means light.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
