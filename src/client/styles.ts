/**
 * Injected stylesheet for the agy Settings section.
 *
 * Plain CSS in a single <style> element rather than CSS modules: this plugin
 * ships one bundle and cannot rely on the host's bundler to process a
 * `*.module.css` import.
 *
 * Follows DSH's own styling contract (deepseek-harness `docs/web-styling.md`):
 *
 * - Colours come from `--dsw-alias-*` semantic tokens, never literal values, so
 *   the section follows the host's light/dark theme instead of shipping a
 *   second palette that drifts.
 * - Text uses the theme's typography ROLE variables (`--dsw-font-*`, which carry
 *   family + size + line-height + weight together) rather than hand-picked
 *   `font-size`/`font-weight` pairs. A hand-picked 550 is not in the host's
 *   scale and is what made this page read heavier than a native section.
 * - Neutral solid borders draw at `0.5px`, the shared hairline weight.
 * - Controls are NOT styled here: they come from the
 *   `@deepseek-ai/dsh-client-ui-primitives` catalog (Button/Switch/Input/Tag/
 *   StateDot), so focus rings, disabled states and size tiers are the
 *   platform's own. This file covers layout and the data visualisations the
 *   host has no primitive for.
 */

const STYLE_ID = 'dsh-agy-styles'

const CSS = `
.agy-root { display: flex; flex-direction: column; gap: 12px; font: var(--dsw-font-xs-13); }
.agy-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.agy-title { font: var(--dsw-font-base-strong-16); color: var(--dsw-alias-label-primary, #1f2329); }
.agy-sub { margin-top: 3px; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-tertiary, #8f959e); }

.agy-tabs {
  display: flex; align-items: flex-end; gap: 22px; margin-top: 2px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2, #eef0f3);
}
.agy-tab {
  position: relative; border: 0; padding: 7px 1px 9px; background: transparent;
  color: var(--dsw-alias-label-tertiary, #8f959e);
  font: var(--dsw-font-xs-13); cursor: pointer;
}
.agy-tab:hover, .agy-tab[data-active="true"] { color: var(--dsw-alias-label-primary, #1f2329); }
/* Active tab is an underline rule, matching the Plugins settings section's own
   tab bar rather than introducing a second, boxed tab idiom. */
.agy-tab[data-active="true"]::after {
  position: absolute; right: 0; bottom: -1px; left: 0; height: 2px;
  border-radius: 2px 2px 0 0; background: var(--dsw-alias-label-primary, #1f2329);
  content: '';
}
.agy-tab:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4176e6);
  outline-offset: 2px;
  border-radius: 4px;
}
.agy-tab .agy-count { margin-left: 5px; font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-tertiary, #8f959e); }

.agy-error { padding: 9px 12px; border-radius: 8px; font: var(--dsw-font-xxs-12);
  color: var(--dsw-alias-state-error-primary, #ec1313);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ec1313) 10%, transparent); }
/* A non-fatal outcome (a partial import). Neutral, not alarming, and it keeps
   newlines so a list of per-source failures stays readable. */
.agy-notice { padding: 9px 12px; border-radius: 8px; font: var(--dsw-font-xxs-12);
  white-space: pre-wrap; overflow-wrap: anywhere;
  color: var(--dsw-alias-label-secondary, #61666b);
  background: var(--dsw-alias-bg-layer-2, #f4f5f7); }
.agy-empty { padding: 24px 12px; text-align: center; font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-tertiary, #8f959e); }
.agy-hint { margin: 0; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-tertiary, #8f959e); }
.agy-aside { font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-tertiary, #8f959e); }
.agy-grow { flex: 1; }

/* ── Grouping surface ───────────────────────────────────────────────────────
   DSH groups with spacing first and a light container second. A settings page
   built only from tables reads as a spreadsheet, so each block gets a card. */
.agy-card {
  border: 0.5px solid var(--dsw-alias-border-l2, #eef0f3);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3, #fff);
  overflow: hidden;
}
.agy-card-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04));
  background: var(--dsw-alias-bg-layer-2, #f9fafb);
}
.agy-card-title { font: var(--dsw-font-xs-strong-13); color: var(--dsw-alias-label-primary, #1f2329); }
.agy-card-body { padding: 6px 12px 8px; }

/* ── Rows inside a card ────────────────────────────────────────────────────
   Follows DSH's own list-row convention (ui-sidebar .panelRow): a 12px-radius
   rounded rect inset 2px from the card edge and transparent at rest. A
   full-bleed rectangle reads as a slab and fights the card's own radius. */
.agy-rows { display: flex; flex-direction: column; gap: 2px; }
/* Master/detail: the account list beside the selected account's detail, so a
   row and the panel it opens stay in view together. Collapses to one column
   when the settings panel is narrow. */
.agy-split { display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: 12px; align-items: start; }
@media (max-width: 720px) { .agy-split { grid-template-columns: 1fr; } }
.agy-rowitem {
  display: grid; grid-template-columns: minmax(0,1fr) auto;
  align-items: center; gap: 12px;
  margin: 0 2px; padding: 10px 8px; box-sizing: border-box;
  min-height: 36px; border-radius: 12px; background: transparent;
}
.agy-rowitem[data-clickable="true"] { cursor: pointer; }
.agy-rowitem[data-clickable="true"]:hover {
  background: var(--dsw-alias-interactive-bg-hover, #f4f5f7);
}
.agy-rowitem[data-selected="true"] {
  background: var(--dsw-alias-interactive-bg-hover, #f4f5f7);
}
.agy-rowitem:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary, #1f2329);
  outline-offset: -2px;
}
.agy-rowmain { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.agy-rowtitle { display: flex; align-items: center; gap: 7px; min-width: 0; }
.agy-rowname {
  font: var(--dsw-font-xs-strong-13); color: var(--dsw-alias-label-primary, #1f2329);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.agy-rowmeta {
  font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-tertiary, #8f959e);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.agy-rowactions { display: flex; align-items: center; gap: 6px; flex: none; }
.agy-state { display: inline-flex; align-items: center; gap: 6px; flex: none; }

.agy-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.agy-actions > :first-child:not(button) { flex: 1; min-width: 150px; }
.agy-detail { display: flex; flex-direction: column; gap: 12px; }

/* ── Metric strip ────────────────────────────────────────────────────────── */
.agy-metrics { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); }
.agy-metric { padding: 12px 0; border-right: 0.5px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04)); }
.agy-metric:last-child { border-right: 0; }
.agy-metric-k { font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-tertiary, #8f959e); }
/* The theme's own role carries family + size + line-height + weight; the
   metric only tightens the tracking. */
.agy-metric-v { margin-top: 4px; font: var(--dsw-font-base-strong-16); letter-spacing: -.015em;
  font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary, #1f2329); }
.agy-metric-v small { margin-left: 2px; font: var(--dsw-font-xxs-strong-12);
  color: var(--dsw-alias-label-tertiary, #8f959e); }
.agy-metric-d { margin-top: 3px; font: var(--dsw-font-xxxs-11);
  color: var(--dsw-alias-label-tertiary, #8f959e); }

/* ── Definition rows (label / value pairs) ───────────────────────────────── */
.agy-defs { display: grid; grid-template-columns: 92px minmax(0,1fr); margin: 0; }
.agy-defs dt {
  padding: 7px 0; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-tertiary, #8f959e);
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04));
}
.agy-defs dd {
  margin: 0; padding: 7px 0; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-secondary, #61666b);
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04));
  overflow-wrap: anywhere;
}
.agy-defs dt:last-of-type, .agy-defs dd:last-of-type { border-bottom: 0; }

/* ── Disclosure (the collapsible model-quota block) ──────────────────────── */
.agy-disclosure { border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04)); }
.agy-disclosure-toggle {
  display: flex; align-items: center; gap: 7px; width: 100%;
  padding: 9px 0; border: 0; cursor: pointer;
  font: var(--dsw-font-xxs-strong-12); text-align: left;
  color: var(--dsw-alias-label-secondary, #61666b); background: none;
}
.agy-disclosure-toggle:hover { color: var(--dsw-alias-label-primary, #1f2329); }
.agy-caret {
  flex: none; width: 0; height: 0; border-left: 4px solid currentColor;
  border-top: 3.5px solid transparent; border-bottom: 3.5px solid transparent;
  transition: transform .15s ease;
}
.agy-disclosure[data-open="true"] .agy-caret { transform: rotate(90deg); }
.agy-disclosure-body { padding-bottom: 8px; }
.agy-disclosure-meta { margin-left: auto; font: var(--dsw-font-xxxs-11);
  color: var(--dsw-alias-label-tertiary, #8f959e); font-variant-numeric: tabular-nums; }

/* ── Quota rows ──────────────────────────────────────────────────────────── */
.agy-quota-row {
  display: grid; grid-template-columns: minmax(0,1fr) 96px 44px;
  align-items: center; gap: 10px; padding: 6px 0;
  font: var(--dsw-font-xxs-12); border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0,0,0,.03));
}
.agy-quota-row:last-child { border-bottom: 0; }
.agy-quota-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #61666b); }
.agy-quota-name code { font: var(--dsw-font-xxxs-11); font-family: var(--ds-font-family-code);
  color: var(--dsw-alias-label-tertiary, #8f959e); margin-left: 6px; }
.agy-quota-track { height: 5px; border-radius: 3px; overflow: hidden;
  background: var(--dsw-alias-border-l2, rgba(0,0,0,.12)); }
.agy-quota-track i { display: block; height: 100%; border-radius: 3px; }
.agy-quota-pct { text-align: right; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, #8f959e); font: var(--dsw-font-xxs-12); }

/* ── Dense breakdown tables (Usage tab only) ─────────────────────────────── */
.agy-table-wrap { padding: 6px 0 2px; }
.agy-table { width: 100%; border-collapse: collapse; font: var(--dsw-font-xs-13); table-layout: fixed; }
.agy-table th {
  text-align: left; padding: 0 8px 7px; font: var(--dsw-font-xxxs-strong-11);
  color: var(--dsw-alias-label-tertiary, #8f959e);
  border-bottom: 0.5px solid var(--dsw-alias-border-l2, #eef0f3); white-space: nowrap;
}
.agy-table td { padding: 8px; vertical-align: middle; color: var(--dsw-alias-label-secondary, #61666b);
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04)); }
.agy-table tr:last-child td { border-bottom: 0; }
.agy-table tbody tr:hover td { background: var(--dsw-alias-bg-layer-2, #f4f5f7); }
.agy-num { text-align: right; font-variant-numeric: tabular-nums; }
/* Inline emphasis on a table cell: a strong role, not a heavier size. */
.agy-strong { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 500; }
.agy-mail { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agy-mono { font-family: var(--ds-font-family-code); }

.agy-bar { display: inline-flex; align-items: center; gap: 8px; justify-content: flex-end; }
.agy-bar .agy-track { width: 56px; height: 4px; border-radius: 2px; overflow: hidden;
  background: var(--dsw-alias-border-l2, rgba(0,0,0,.12)); }
.agy-bar .agy-track i { display: block; height: 100%; border-radius: 2px;
  background: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); }

/* ── Range picker container ────────────────────────────────────────────────
   The pills themselves are the host Pill primitive (its own fill pair and
   active state); this only lays them out in a row. */
.agy-chips { display: flex; gap: 6px; }

/* Danger has no primitive variant; keep the ghost skin and tint the label. */
.agy-btn-danger { color: var(--dsw-alias-state-error-primary, #ec1313) !important; }

.agy-toolbar { display: flex; align-items: center; gap: 8px; }
.agy-textarea { width: 100%; min-height: 88px; resize: vertical; outline: none;
  padding: 9px 10px; font: var(--dsw-font-xxs-12); font-family: var(--ds-font-family-code);
  color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff);
  border: 0.5px solid var(--dsw-alias-border-l2, #eef0f3); border-radius: 8px; }
.agy-textarea:focus { border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); }
`

/** Install the stylesheet once (idempotent across plugin reloads). */
export function installAgyStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.getElementById(STYLE_ID) !== null) {
    return () => {
      document.getElementById(STYLE_ID)?.remove()
    }
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => {
    document.getElementById(STYLE_ID)?.remove()
  }
}
