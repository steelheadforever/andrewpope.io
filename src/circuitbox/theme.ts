// Pull the site's design tokens out of CSS custom properties so the canvas
// renderer stays in sync with global.css — change a colour there and the
// breadboard follows. Fallbacks mirror :root in src/styles/global.css.

export interface Theme {
  bg: string;
  bgSoft: string;
  fg: string;
  muted: string;
  rule: string;
  amber: string;
  amberDim: string;
  red: string;
}

export function readTheme(el: HTMLElement = document.documentElement): Theme {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) =>
    s.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--bg", "#14120e"),
    bgSoft: v("--bg-soft", "#1b1812"),
    fg: v("--fg", "#e9e1cf"),
    muted: v("--muted", "#948b76"),
    rule: v("--rule", "#2c281f"),
    amber: v("--amber", "#e6a94c"),
    amberDim: v("--amber-dim", "#b9863c"),
    red: v("--red", "#d56353"),
  };
}
