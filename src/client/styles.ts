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
 * row and the panel it opens stay in view together.
 *
 * The collapse MUST be a CONTAINER query, not a viewport one. This section
 * renders inside the Settings panel, which is ~600px wide even on a large
 * display, so the former @media (max-width: 720px) never fired: the split
 * stayed two-column everywhere and the 300px master column squeezed the detail
 * to ~280px. That is the reported symptom (the panel "feels too narrow"): the
 * account email truncated to "a1…" and the latency value wrapped onto three
 * lines. The measured constraint is the PANEL's width, so the query must follow
 * it.
 *
 * The containment lives on a dedicated wrapper, NOT on .agy-root:
 * container-type: inline-size applies layout containment, which makes the
 * element a containing block for fixed-position descendants — and the host's
 * Tooltip (used by the thinking-budget fields) positions its bubble with
 * position: fixed. Scoping it here keeps that behaviour intact.
 */
.agy-split-wrap { container-type: inline-size; }
.agy-split { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; }
@container (min-width: 700px) {
  .agy-split { grid-template-columns: minmax(0, 300px) minmax(0, 1fr); }
}
/* Cap the master list so a large pool cannot push the detail it opens below the
   fold — the reason the split exists at all. Scoped to the split: the Models tab
   shares .agy-rows for its own long list and must keep growing freely. */
.agy-split .agy-rows { max-height: 300px; overflow-y: auto; }
.agy-rowitem {
  /* Flex-wrap, NOT the former grid-template-columns: minmax(0,1fr) auto.
     A grid's 1fr may shrink to zero, so the identity column yielded all its
     width to the action cluster: at the 300px master column the row's ~167px of
     state badge + Verify/Delete left ~45px for the email (which needs ~177px),
     truncating every address to "a1…" even though the row had room to grow
     downward. With a flex BASIS the actions wrap to a second line instead of
     squeezing the name, and margin-left: auto keeps them right-aligned on the
     same line whenever they do fit. */
  display: flex; flex-wrap: wrap;
  align-items: center; gap: 4px 12px;
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
.agy-rowmain { min-width: 0; flex: 1 1 160px; display: flex; flex-direction: column; gap: 3px; }
.agy-rowtitle { display: flex; align-items: center; gap: 7px; min-width: 0; }
.agy-rowname {
  font: var(--dsw-font-xs-strong-13); color: var(--dsw-alias-label-primary, #1f2329);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.agy-rowmeta {
  font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-tertiary, #8f959e);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* margin-left: auto right-aligns the cluster while it shares a line with the
   identity, and becomes inert once flex-wrap moves it to its own line. */
.agy-rowactions { display: flex; align-items: center; gap: 6px; flex: none; margin-left: auto; }
/* Per-model test: a quiet text button, not a capsule — one per row of a long
   list, so a solid Button would read as five competing primary actions. */
.agy-rowtest {
  border: 0; padding: 2px 4px; background: transparent; cursor: pointer;
  font: var(--dsw-font-xxs-12);
  color: var(--dsw-alias-state-business-primary, #4176e6);
  border-radius: 6px;
}
.agy-rowtest:hover:not(:disabled) { color: var(--dsw-alias-label-primary, #1f2329); }
.agy-rowtest:disabled { cursor: default; opacity: 0.55; }
.agy-rowtest:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4176e6);
  outline-offset: 1px;
}
.agy-state { display: inline-flex; align-items: center; gap: 6px; flex: none; }

.agy-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.agy-actions > :first-child:not(button) { flex: 1; min-width: 150px; }
.agy-detail { display: flex; flex-direction: column; gap: 12px; }

/* ── Metric strip ────────────────────────────────────────────────────────── */
.agy-metrics { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); }
/* No vertical rules between cells: the columns read as separated already by
   the gap and their own left alignment, and the dividers turned a metric strip
   into a spreadsheet grid. */
.agy-metric { padding: 12px 0; }
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
  display: grid; grid-template-columns: minmax(0,1fr) 96px minmax(0,auto);
  align-items: center; gap: 10px; padding: 6px 0;
  font: var(--dsw-font-xxs-12); border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0,0,0,.03));
}
.agy-quota-row:last-child { border-bottom: 0; }
.agy-quota-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #61666b); }
.agy-quota-track { height: 5px; border-radius: 3px; overflow: hidden;
  background: var(--dsw-alias-border-l2, rgba(0,0,0,.12)); }
.agy-quota-track i { display: block; height: 100%; border-radius: 3px; }
/* The reset phrase lives in the trailing column so every row's id starts at the
   same x — inline-after-name made each row run a different length. */
.agy-quota-pct { display: flex; align-items: baseline; justify-content: flex-end; gap: 8px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, #8f959e); font: var(--dsw-font-xxs-12); }
.agy-quota-pct code { font: var(--dsw-font-xxxs-11); font-family: var(--ds-font-family-code);
  color: var(--dsw-alias-label-tertiary, #8f959e); }

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
/* Numeric HEADERS must right-align too, and .agy-num alone cannot do it: the
   .agy-table th rule above is specificity 0-1-1 and outranks the bare .agy-num
   class (0-1-0), so every numeric th stayed left while its td cells
   right-aligned — the header label sat at the column's left edge with its
   figure out at the right, which is what read as "the data is skewed right".
   Matching the cell class on the header element (0-2-1) wins instead of
   escalating with !important. */
.agy-table th.agy-num { text-align: right; }
/* Inline emphasis on a table cell: a strong role, not a heavier size. */
.agy-strong { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 500; }
.agy-mail { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agy-mono { font-family: var(--ds-font-family-code); }
/* The one external link in the section (a verification appeal URL). Colored and
   underlined with theme tokens rather than left to the browser default, which
   ignores both the light/dark theme and the host's brand color. */
.agy-link { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); text-decoration: underline; }
.agy-link:hover { opacity: 0.8; }

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
