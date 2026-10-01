window.__ModuleLoader__.load({ id: "dsh-agy", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  AgySettings: () => AgySettings,
  apply: () => apply,
  canActivateAccount: () => canActivateAccount,
  inject: () => inject,
  orderModels: () => orderModels,
  resolveSelectedAccountIndex: () => resolveSelectedAccountIndex,
  throughputTokenPerSecond: () => throughputTokenPerSecond,
  tokenText: () => tokenText,
  truncateIdentity: () => truncateIdentity
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/styles.ts
var STYLE_ID = "dsh-agy-styles";
var CSS = `
.agy-root { display: flex; flex-direction: column; gap: 12px; font: var(--dsw-font-xs-13); max-width: 100%; min-width: 0; box-sizing: border-box; }
.agy-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; min-width: 0; flex-wrap: wrap; }
.agy-title { font: var(--dsw-font-base-strong-16); color: var(--dsw-alias-label-primary, #1f2329); }
.agy-sub { margin-top: 3px; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-tertiary, #8f959e); }

.agy-tabs {
  display: flex; align-items: flex-end; gap: 22px; margin-top: 2px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2, #eef0f3);
  max-width: 100%; overflow-x: auto; scrollbar-width: none; flex-wrap: nowrap;
}
.agy-tabs::-webkit-scrollbar { display: none; }
.agy-tab {
  position: relative; border: 0; padding: 7px 1px 9px; background: transparent;
  color: var(--dsw-alias-label-tertiary, #8f959e);
  font: var(--dsw-font-xs-13); cursor: pointer; flex: none; white-space: nowrap;
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

/* A failed action states WHAT failed and then WHY, on two lines. The default
   white-space (normal) folds that newline into a space and runs the verdict
   into the upstream error, so the separator has to be preserved here exactly as
   .agy-notice already does for its own multi-line form. */
.agy-error { padding: 9px 12px; border-radius: 8px; font: var(--dsw-font-xxs-12);
  white-space: pre-wrap; overflow-wrap: anywhere;
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

/* \u2500\u2500 Grouping surface \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   DSH groups with spacing first and a light container second. A settings page
   built only from tables reads as a spreadsheet, so each block gets a card. */
.agy-card {
  border: 0.5px solid var(--dsw-alias-border-l2, #eef0f3);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3, #fff);
  overflow: hidden;
  min-width: 0;
  box-sizing: border-box;
}
.agy-card-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04));
  background: var(--dsw-alias-bg-layer-2, #f9fafb);
  min-width: 0;
}
.agy-card-title { font: var(--dsw-font-xs-strong-13); color: var(--dsw-alias-label-primary, #1f2329); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agy-card-body { padding: 6px 12px 8px; min-width: 0; box-sizing: border-box; }

/* \u2500\u2500 Rows inside a card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Follows DSH's own list-row convention (ui-sidebar .panelRow): a 12px-radius
   rounded rect inset 2px from the card edge and transparent at rest. A
   full-bleed rectangle reads as a slab and fights the card's own radius. */
.agy-rows { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
/* The live line: one status strip above the rows, present ONLY while upstream
   requests are in flight \u2014 an idle pool renders no strip, so quiet stays quiet.
   The pulsing dot is the host StateDot primitive ('ongoing'), so the animation
   is the platform's; this rule is layout and tone only. Sits OUTSIDE .agy-rows,
   so the master list's scroll cap does not scroll the status away. */
.agy-live {
  display: flex; align-items: center; gap: 7px;
  margin: 2px 2px 6px; padding: 7px 8px; border-radius: 10px;
  font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-secondary, #61666b);
  background: var(--dsw-alias-bg-layer-2, #f4f5f7);
}
/* Master/detail: the account list beside the selected account's detail, so a
 * row and the panel it opens stay in view together.
 *
 * The collapse MUST be a CONTAINER query, not a viewport one. This section
 * renders inside the Settings panel, which is ~600px wide even on a large
 * display, so the former @media (max-width: 720px) never fired: the split
 * stayed two-column everywhere and the 300px master column squeezed the detail
 * to ~280px. That is the reported symptom (the panel "feels too narrow"): the
 * account email truncated to "a1\u2026" and the latency value wrapped onto three
 * lines. The measured constraint is the PANEL's width, so the query must follow
 * it.
 *
 * The containment lives on a dedicated wrapper, NOT on .agy-root:
 * container-type: inline-size applies layout containment, which makes the
 * element a containing block for fixed-position descendants \u2014 and the host's
 * Tooltip (used by the thinking-budget fields) positions its bubble with
 * position: fixed. Scoping it here keeps that behaviour intact.
 */
.agy-split-wrap { container-type: inline-size; max-width: 100%; min-width: 0; }
.agy-split { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: start; min-width: 0; }
@container (min-width: 700px) {
  .agy-split { grid-template-columns: minmax(0, 300px) minmax(0, 1fr); }
}
/* Cap the master list so a large pool cannot push the detail it opens below the
   fold \u2014 the reason the split exists at all. Scoped to the split: the Models tab
   shares .agy-rows for its own long list and must keep growing freely. */
.agy-split .agy-rows { max-height: 190px; overflow-y: auto; }
.agy-rowitem {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  margin: 0 2px;
  padding: 10px 8px;
  box-sizing: border-box;
  min-height: auto;
  border-radius: 12px;
  background: transparent;
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
.agy-rowmain {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.agy-rowtitle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  min-width: 0;
}
.agy-rowname {
  font: var(--dsw-font-xs-strong-13); color: var(--dsw-alias-label-primary, #1f2329);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.agy-rowmeta {
  font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-tertiary, #8f959e);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* Actions cluster: clean second row with full width, never gets pushed off screen */
.agy-rowactions, .agy-rowbtns {
  display: flex !important;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  width: 100%;
  margin-left: 0;
  visibility: visible !important;
  opacity: 1 !important;
}
.agy-state { display: inline-flex; align-items: center; gap: 6px; flex: none; }

.agy-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}
.agy-actions > button,
.agy-actions > [class*="button"] {
  flex: 1 1 calc(50% - 6px);
  min-width: 90px;
  justify-content: center;
  white-space: nowrap;
}
.agy-actions > :first-child:not(button) {
  flex: 1 1 100%;
  min-width: 100%;
}
.agy-detail { display: flex; flex-direction: column; gap: 12px; }

/* \u2500\u2500 Metric strip \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Token composition \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   A share bar per bucket, under the headline metrics. This exists to answer
   "why is cache read larger than the input?" with a proportion instead of
   prose: the cache re-reads the whole prefix each turn, so its share dominates.
   Rows are laid out as label / track / value / percent so the numbers stay in
   columns and remain scannable. */
.agy-compose { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.agy-compose-row {
  display: grid; grid-template-columns: 64px minmax(0,1fr) 56px 44px;
  align-items: center; gap: 10px;
}
.agy-compose-k { font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-tertiary, #8f959e); }
.agy-compose-track {
  height: 6px; border-radius: 3px; overflow: hidden;
  background: var(--dsw-alias-border-l2, rgba(0,0,0,.12));
}
.agy-compose-track i { display: block; height: 100%; border-radius: 3px; }
.agy-compose-v { text-align: right; font: var(--dsw-font-xxs-12);
  font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary, #61666b); }
.agy-compose-p { text-align: right; font: var(--dsw-font-xxxs-11);
  font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-tertiary, #8f959e); }
/* A table's own footnote: states a column's scope that its header cannot. */
.agy-table-note { padding: 6px 8px 2px; }
/* The 65535 row is a CONFIGURATION of High, not a sibling tier: indenting it
   makes the dependency visible without adding a column or a badge. */
.agy-table td.agy-nested { padding-left: 20px; font-weight: 400; }

/* \u2500\u2500 Definition rows (label / value pairs) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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

/* \u2500\u2500 Disclosure (the collapsible model-quota block) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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
/* One row per reasoning level: label, then the budget input. The input is
   width-capped so the empty state reads as "no value set" rather than as a wide
   field waiting to be filled. */
/* Label | input | chips. Two content columns plus shortcuts, with real vertical
   breathing room: the earlier three-column version (label | input | a sentence
   restating the row's own label) packed four rows into 5px padding and 10px gaps,
   which read as one solid block. */
.agy-thinking-group { display: flex; flex-direction: column; }
.agy-thinking-group + .agy-thinking-group { margin-top: 16px; }
.agy-thinking-group-name {
  font: var(--dsw-font-xxs-strong-12); color: var(--dsw-alias-label-secondary, #61666b);
  margin-bottom: 2px;
}
.agy-thinking-group .agy-hint { margin: 0 0 8px; }
/* The four things a reader can actually DO with this setting. A list, because
   each is an independent action, and prose buried them. */
.agy-thinking-effects { margin: 2px 0 10px; }
/* Claude's three differences, as a list: each is an independent axis, and the
   last one is why that group has no reference table. */
.agy-thinking-notes { margin: 0 0 8px; padding-left: 18px; }
.agy-thinking-notes li {
  font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-tertiary, #8f959e);
  line-height: 1.6;
}
.agy-thinking-row {
  display: grid; grid-template-columns: 72px minmax(0, 180px) auto;
  align-items: center; gap: 14px; padding: 8px 0;
}
.agy-thinking-k { font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-secondary, #61666b); }
/* Shortcut chips, not a second control: they fill the field beside them. */
.agy-thinking-chips { display: flex; gap: 6px; }
.agy-thinking-chip {
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(0,0,0,.15));
  background: transparent; cursor: pointer; border-radius: 10px;
  padding: 2px 8px; font: var(--dsw-font-xxxs-11);
  color: var(--dsw-alias-label-secondary, #61666b);
}
.agy-thinking-chip:hover { background: var(--dsw-alias-interactive-bg-hover); }
.agy-thinking-chip:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4176e6); outline-offset: 1px;
}
.agy-disclosure-meta { margin-left: auto; font: var(--dsw-font-xxxs-11);
  color: var(--dsw-alias-label-tertiary, #8f959e); font-variant-numeric: tabular-nums; }

/* \u2500\u2500 5h / weekly limits \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   One group per upstream group (Gemini, Claude+GPT), each with its windows.
   The rows are a fixed 4-column grid so the bars and the percentages line up
   across groups: label / bar / percentage / reset countdown. */
.agy-limits { display: flex; flex-direction: column; gap: 10px; padding: 4px 0; }
.agy-limit-age { font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-tertiary, #8f959e); }
.agy-limit-group { display: flex; flex-direction: column; gap: 2px; }
.agy-limit-group-name {
  font: var(--dsw-font-xxs-strong-12); color: var(--dsw-alias-label-secondary, #61666b);
  padding-bottom: 2px;
}
.agy-limit-row {
  display: grid; grid-template-columns: 58px minmax(0,1fr) 40px minmax(0,auto);
  align-items: center; gap: 10px; padding: 4px 0;
  font: var(--dsw-font-xxs-12);
}
.agy-limit-k { color: var(--dsw-alias-label-secondary, #61666b); }
.agy-limit-track { height: 6px; border-radius: 3px; overflow: hidden;
  background: var(--dsw-alias-border-l2, rgba(0,0,0,.12)); }
.agy-limit-track i { display: block; height: 100%; border-radius: 3px; }
.agy-limit-p { text-align: right; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary, #1f2329); }
.agy-limit-reset { text-align: right; font: var(--dsw-font-xxxs-11);
  color: var(--dsw-alias-label-tertiary, #8f959e); }
/* The burn projection: indented to align with the bar (58px label + 10px gap),
   warn-tinted because "this window runs dry before it resets" is the one
   projection that asks the reader to act. */
.agy-limit-burn { padding: 0 0 4px 68px;
  font: var(--dsw-font-xxxs-11);
  color: var(--dsw-alias-state-warn-primary, #f59e0b); }

/* \u2500\u2500 Dense breakdown tables (Usage tab only) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
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
   right-aligned \u2014 the header label sat at the column's left edge with its
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

/* \u2500\u2500 Range picker container \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   The pills themselves are the host Pill primitive (its own fill pair and
   active state); this only lays them out in a row. */
.agy-chips { display: flex; gap: 6px; }

/* Danger has no primitive variant; keep the ghost skin and tint the label. */
.agy-btn-danger { color: var(--dsw-alias-state-error-primary, #ec1313) !important; }

/* \u2500\u2500 Recent activity ring \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   The "what just happened" list. Only the result cell carries color \u2014 ok
   inherits the table's neutral, and a wall of tinted rows would read as an
   alarm rather than a log. */
.agy-recent-state { font: var(--dsw-font-xxs-12); }
.agy-recent-state[data-kind="fail"] { color: var(--dsw-alias-state-error-primary, #ec1313); }
.agy-recent-state[data-kind="limited"] { color: var(--dsw-alias-state-warn-primary, #f59e0b); }
.agy-recent-state[data-kind="rotation"] { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); }
/* The recent list is a standalone disclosure on the tab root, not one block
   inside a card body \u2014 the separator border-top the disclosure idiom uses
   between sibling blocks would draw a stray line across nothing here. */
.agy-recent.agy-disclosure { border-top: 0; }

.agy-toolbar { display: flex; align-items: center; gap: 8px; }
.agy-textarea { width: 100%; min-height: 88px; resize: vertical; outline: none;
  padding: 9px 10px; font: var(--dsw-font-xxs-12); font-family: var(--ds-font-family-code);
  color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff);
  border: 0.5px solid var(--dsw-alias-border-l2, #eef0f3); border-radius: 8px; }
.agy-textarea:focus { border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); }

/* \u2500\u2500 Mobile responsiveness (<= 768px) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
@media (max-width: 768px) {
  .agy-head { gap: 8px; flex-wrap: wrap; }
  .agy-tabs { gap: 16px; margin-top: 0; }
  .agy-split .agy-rows { max-height: 180px; overflow-y: auto; }
  .agy-actions > button,
  .agy-actions > [class*="button"] {
    flex: 1 1 calc(50% - 6px) !important;
    min-width: 90px !important;
  }
  .agy-defs {
    grid-template-columns: 80px minmax(0, 1fr) !important;
  }
  .agy-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }
  .agy-compose-row {
    grid-template-columns: 56px minmax(0, 1fr) 48px 36px !important;
    gap: 6px !important;
  }
  .agy-thinking-row {
    grid-template-columns: 60px minmax(0, 1fr) !important;
    gap: 8px !important;
  }
  .agy-thinking-chips {
    grid-column: 1 / -1 !important;
    margin-top: 4px !important;
    flex-wrap: wrap !important;
  }
}
`;
function installAgyStyles() {
  if (typeof document === "undefined") return () => {
  };
  if (document.getElementById(STYLE_ID) !== null) {
    return () => {
      document.getElementById(STYLE_ID)?.remove();
    };
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => {
    document.getElementById(STYLE_ID)?.remove();
  };
}

// src/client/locales.ts
var zh = {
  title: "Antigravity",
  subtitle: "\u8D26\u53F7\u8F6E\u6362\u3001\u6A21\u578B\u53EF\u89C1\u6027\u3001\u7528\u91CF\u4E0E\u51ED\u636E",
  refresh: "\u5237\u65B0",
  login: "\u767B\u5F55",
  loading: "\u52A0\u8F7D\u4E2D\u2026",
  tabAccounts: "\u8D26\u53F7",
  tabModels: "\u6A21\u578B",
  tabUsage: "\u7528\u91CF",
  tabCredentials: "\u51ED\u636E",
  // A pool-eligibility state, not a usage report: it means "enabled, not cooling,
  // not parked" — the account MAY be picked. "使用中" would claim the account is
  // serving requests right now, which collides with `currentAccount` (the one the
  // pool preference points at) and is false for every other healthy row.
  stateActive: "\u53EF\u7528",
  stateCooling: "\u51B7\u5374\u4E2D",
  stateVerificationRequired: "\u5F85\u9A8C\u8BC1",
  stateDisabled: "\u5DF2\u505C\u7528",
  coolingUntil: "\u51B7\u5374\u81F3",
  // The verification row's badge carries its own window end, which is the
  // question a parked account answers ("how long until the pool retries").
  verificationRetry: "\u5F85\u9A8C\u8BC1 \xB7 {time} \u91CD\u8BD5",
  currentAccount: "\u5F53\u524D\u8D26\u53F7",
  // Disabled has exactly one cause in this codebase (an upstream invalid_grant
  // on the refresh token), so the reason is a fixed sentence, not a taxonomy.
  fieldDisabled: "\u505C\u7528",
  disabledCredentials: "\u51ED\u636E\u5931\u6548",
  disabledSince: "\u505C\u7528\u4E8E {ago}",
  disabledHint: "\u51ED\u636E\u5DF2\u88AB\u4E0A\u6E38\u62D2\u7EDD\u3002\u8FD0\u884C\u8BE5\u8D26\u53F7\u6240\u5728\u884C\u7684\u300C\u9A8C\u8BC1\u300D\u5C1D\u8BD5\u6062\u590D\uFF1B\u82E5\u4ECD\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u5BFC\u5165\u3002",
  noProject: "\u2014",
  valueUnknown: "\u2014",
  colAccount: "\u8D26\u53F7",
  colRequests: "\u8BF7\u6C42",
  // The recent-activity list's columns. Success/failure/limit/rotation reuse
  // the existing result words; only the bespoke headers are new here.
  colTime: "\u65F6\u95F4",
  colResult: "\u7ED3\u679C",
  colDuration: "\u8017\u65F6",
  recentTitle: "\u6700\u8FD1\u8BF7\u6C42",
  recentHelp: "\u672C\u8FDB\u7A0B\u5185\u5B58\u4E2D\u7684\u6700\u8FD1 200 \u6761\uFF08\u542B\u8F6E\u6362\u4E8B\u4EF6\uFF09\uFF0C\u4E0D\u843D\u76D8\u3001\u4E0D\u8DE8\u8FDB\u7A0B\u5408\u5E76\u3002",
  recentEmpty: "\u6682\u65E0\u6700\u8FD1\u8BB0\u5F55",
  recentOk: "\u6210\u529F",
  // The row's count is ALL-TIME, while the Usage tab defaults to "today" — the
  // bare 请求 label let the two figures read as the same quantity.
  rowRequestsTotal: "\u7D2F\u8BA1\u8BF7\u6C42 {n}",
  lastActive: "{ago}\u6D3B\u8DC3",
  // The live line: present only while upstream requests are in flight.
  liveOne: "\u6B63\u5728\u901A\u8FC7 {email} \u751F\u6210 \xB7 {count} \u4E2A\u5E76\u53D1",
  liveMany: "\u6B63\u5728\u751F\u6210 \xB7 {count} \u4E2A\u5E76\u53D1 \xB7 {accounts} \u4E2A\u8D26\u53F7",
  fieldThroughput: "\u541E\u5410",
  throughputValue: "\u2248 {n} token/s",
  // The qualifier that makes the number meaningful: the denominator EXCLUDES the
  // first-token wait (which the 延迟 row right above shows separately), so the
  // figure is the streaming decode rate, not a whole-request average.
  throughputNote: "\u9996 token \u540E \xB7 \u7D2F\u8BA1\u5E73\u5747",
  colActions: "\u64CD\u4F5C",
  emptyAccounts: "\u8FD8\u6CA1\u6709\u8D26\u53F7\u3002\u5207\u5230\u300C\u51ED\u636E\u300D\u6807\u7B7E\u5BFC\u5165\uFF0C\u6216\u70B9\u51FB\u4E0A\u65B9\u300C\u767B\u5F55\u300D\u3002",
  detailTitle: "\u5DF2\u9009\u8D26\u53F7",
  limitsTitle: "\u9650\u989D",
  limitsUnavailable: "\u5C1A\u672A\u6D4B\u91CF\u3002\u914D\u989D\u6309\u8D26\u53F7\u5B9A\u671F\u5237\u65B0\u540E\u663E\u793A\u3002",
  limitsMeasured: "\u6D4B\u91CF\u4E8E {ago}",
  limitsRefreshOk: "\u5DF2\u5237\u65B0 {measured} \u4E2A\u8D26\u53F7\u7684\u9650\u989D",
  limitsRefreshFresh: "\u9650\u989D\u4ECD\u662F\u65B0\u9C9C\u7684\uFF0C\u65E0\u9700\u5237\u65B0",
  limitsRefreshFailed: "{failed} \u4E2A\u8D26\u53F7\u7684\u9650\u989D\u5237\u65B0\u5931\u8D25",
  // Spoken only when the sampled burn rate would empty the window BEFORE its
  // reset — otherwise the reset time beside it is already the answer.
  limitBurnWarn: "\u6309\u6B64\u901F\u5EA6{value}\u540E\u8017\u5C3D",
  quotaWindow5h: "5 \u5C0F\u65F6",
  quotaWindowWeekly: "\u6BCF\u5468",
  fieldProject: "\u9879\u76EE",
  fieldProxy: "\u4EE3\u7406",
  fieldFingerprint: "\u6307\u7EB9",
  fieldCooldownReason: "\u51B7\u5374\u539F\u56E0",
  cooldownReasonNetworkError: "\u7F51\u7EDC\u9519\u8BEF",
  cooldownReasonQuotaExhausted: "\u989D\u5EA6\u8017\u5C3D",
  cooldownReasonValidationRequired: "\u9700\u8981\u9A8C\u8BC1",
  cooldownReasonProjectError: "\u9879\u76EE\u9519\u8BEF",
  fieldSources: "\u8C03\u7528\u6765\u6E90",
  fieldLatency: "\u5EF6\u8FDF",
  fieldVerification: "\u9A8C\u8BC1",
  verificationOpen: "\u524D\u5F80\u9A8C\u8BC1",
  verificationNoUrl: "\u4E0A\u6E38\u672A\u63D0\u4F9B\u94FE\u63A5\uFF0C\u8BF7\u5728 Antigravity \u4E2D\u5B8C\u6210\u9A8C\u8BC1",
  labelLatencyAverage: "\u5E73\u5747\u5EF6\u8FDF",
  labelTtft: "\u9996 token",
  proxyPlaceholder: "socks5://host:port",
  proxyDirect: "\u672A\u914D\u7F6E\uFF08\u76F4\u8FDE\uFF09",
  fingerprintNone: "\u672A\u751F\u6210",
  fingerprintRegenerated: "\u5DF2\u91CD\u5EFA {count} \u6B21 \xB7 {date}",
  latencyAverage: "\u5E73\u5747 {value}",
  latencyTtft: "\u9996 token {value}",
  sourcesSummary: "\u5BF9\u8BDD {chat} \xB7 CLI {cli} \xB7 \u9A8C\u8BC1 {verify} \xB7 \u6D4B\u8BD5 {test}",
  quotaResetIn: "\u91CD\u7F6E {value}",
  relNow: "\u5373\u5C06",
  relJustNow: "\u521A\u521A",
  relSeconds: "{n} \u79D2",
  relAgo: "{value}\u524D",
  relMinutes: "{n} \u5206\u949F",
  relHours: "{n} \u5C0F\u65F6",
  relDays: "{n} \u5929",
  relMonths: "{n} \u4E2A\u6708",
  relYears: "{n} \u5E74",
  // Switches the pool PREFERENCE to this account; it does not enable a disabled
  // one (that is what 验证 does), which is why the verb is "set as current".
  actionActivate: "\u8BBE\u4E3A\u5F53\u524D",
  actionVerify: "\u9A8C\u8BC1",
  actionDelete: "\u5220\u9664",
  actionTest: "\u6D4B\u8BD5\u8C03\u7528",
  actionExport: "\u5BFC\u51FA Blob",
  actionRegenerateFingerprint: "\u91CD\u7F6E\u6307\u7EB9",
  actionSave: "\u4FDD\u5B58",
  actionClear: "\u6E05\u9664",
  actionTestProxy: "\u6D4B\u8BD5",
  actionTestModel: "\u6D4B\u8BD5",
  modelTesting: "\u6D4B\u8BD5\u4E2D\u2026",
  modelTestOk: "{model} \u53EF\u7528\u3002",
  modelTestFail: "{model} \u6D4B\u8BD5\u5931\u8D25\uFF1A",
  proxyTestOk: "\u4EE3\u7406\u53EF\u8FBE\uFF1A{proxy}",
  proxyTestFail: "\u4EE3\u7406\u4E0D\u53EF\u8FBE\uFF1A{proxy}",
  proxyTestNoTarget: "\u5148\u586B\u5199\u4EE3\u7406\u5730\u5740\uFF0C\u6216\u4FDD\u5B58\u4E00\u4E2A\u4EE3\u7406",
  verifyOk: "\u51ED\u8BC1\u6709\u6548\uFF1A{email}",
  verifyFail: "\u9A8C\u8BC1\u5931\u8D25\uFF1A",
  confirmDelete: "\u5220\u9664\u8FD9\u4E2A\u8D26\u53F7\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",
  noModelToTest: "\u6CA1\u6709\u53EF\u7528\u4E8E\u6D4B\u8BD5\u7684\u6A21\u578B",
  exportFailed: "\u5BFC\u51FA\u5931\u8D25",
  importResult: "\u5BFC\u5165 {imported} \u4E2A\uFF0C\u8986\u76D6 {replaced} \u4E2A\u3002",
  importPartial: "\u5BFC\u5165 {imported} \u4E2A\uFF0C\u8986\u76D6 {replaced} \u4E2A\uFF0C\u5931\u8D25 {failed} \u4E2A\uFF1A",
  usageCumulative: "\u7528\u91CF \xB7 \u7D2F\u8BA1",
  usageTitle: "\u7528\u91CF",
  kpiTotalTokens: "\u603B Token",
  kpiTotalDetail: "{requests} \u6B21\u8BF7\u6C42 \xB7 \u5931\u8D25 {failed}",
  kpiInput: "\u8F93\u5165",
  kpiOutput: "\u8F93\u51FA",
  kpiCacheRead: "\u7F13\u5B58\u547D\u4E2D",
  kpiRequests: "\u8BF7\u6C42",
  kpiInputMissed: "\u672A\u547D\u4E2D {tokens}",
  kpiInputMissedLabel: "\u672A\u547D\u4E2D",
  kpiOutputDetail: "\u542B\u63A8\u7406",
  kpiCacheHit: "\u5360\u8F93\u5165 {percent}%",
  kpiNoBilledInput: "\u65E0\u8BA1\u8D39\u8F93\u5165",
  kpiRequestsDetail: "\u6210\u529F {succeeded} \xB7 \u5931\u8D25 {failed}",
  fieldCacheWrite: "\u7F13\u5B58\u5199",
  fieldRateLimitRotation: "\u9650\u6D41 / \u8F6E\u6362",
  byModel: "\u6309\u6A21\u578B",
  byAccount: "\u6309\u8D26\u53F7",
  trendTitle: "\u8FD1 7 \u5929",
  colDay: "\u65E5\u671F",
  colModel: "\u6A21\u578B",
  colTokenShare: "Token \u5360\u6BD4",
  colOutput: "\u8F93\u51FA",
  colToken: "Token",
  colFailed: "\u5931\u8D25",
  colRateLimited: "\u9650\u6D41",
  colRotations: "\u8F6E\u6362",
  rangeToday: "\u4ECA\u65E5",
  rangeWeek: "7 \u5929",
  rangeMonth: "30 \u5929",
  rangeAll: "\u5168\u90E8",
  since: "\u81EA {date} \u8D77",
  emptyUsage: "\u8FD8\u6CA1\u6709\u7528\u91CF\u8BB0\u5F55\u3002",
  thinkingTitle: "\u601D\u8003\u9884\u7B97",
  thinkingDefaultAll: "\u9ED8\u8BA4",
  thinkingConfigured: "{count} \u9879\u5DF2\u8BBE\u7F6E",
  thinkingLevelLow: "\u4F4E",
  thinkingLevelMedium: "\u4E2D",
  thinkingLevelHigh: "\u9AD8",
  thinkingAuto: "\u9ED8\u8BA4",
  // An ACTION, not a state: the chip empties the field.
  thinkingChipClear: "\u6E05\u7A7A",
  thinkingGeminiGroup: "Gemini",
  // Describes what the USER SEES and can do, not how detection works: the id
  // suffix is an implementation detail nobody can check from the UI.
  thinkingGeminiHint: "\u601D\u8003\u9884\u7B97\u662F API \u91CC\u7684\u4E00\u4E2A\u9690\u85CF\u53C2\u6570\uFF0C\u7528\u6765\u63A7\u5236\u6A21\u578B\u601D\u8003\u7684\u52AA\u529B\u7A0B\u5EA6\u3002\u4E0A\u6E38\u7ED9\u5176\u4E2D\u51E0\u4E2A\u53D6\u503C\u8D77\u4E86\u540D\u5B57\uFF0C\u8FD9\u5C31\u662F\u4F60\u5728\u6A21\u578B\u9009\u62E9\u5668\u91CC\u770B\u5230\u7684 reasoning effort\uFF08high / medium / low\uFF09\u3002\u586B\u5165\u9884\u7B97\u4F1A\u66FF\u6362\u6389\u539F\u672C\u7684 high / medium / low \u4F20\u7ED9\u6A21\u578B\uFF0C\u800C\u4E0D\u662F\u53E0\u52A0\u3002",
  thinkingEffectLowUp: "\u8BA9\u4F4E\u6863\u60F3\u5F97\u66F4\u591A\uFF1A\u5728 Low \u884C\u586B\u5165\u8F83\u5927\u6570\u503C",
  thinkingEffectHighDown: "\u8BA9\u9AD8\u6863\u60F3\u5F97\u66F4\u5C11\uFF08\u66F4\u5FEB\u3001\u66F4\u7701\uFF09\uFF1A\u5728 High \u884C\u586B\u5165\u8F83\u5C0F\u6570\u503C",
  thinkingEffectMax: "\u83B7\u5F97\u6700\u5927\u601D\u8003\uFF1A\u76F4\u63A5\u9009 High\uFF0C\u4E0D\u5FC5\u586B\u503C",
  thinkingEffectReset: "\u6062\u590D\u8BE5\u6863\u9ED8\u8BA4\uFF1A\u6E05\u7A7A\u8BE5\u884C",
  thinkingTieredLabel: "Default",
  thinkingSamplesTitle: "\u5B9E\u6D4B\u601D\u8003\u91CF\u53C2\u8003",
  thinkingSamplesIntro: "\u6A21\u578B\u4F1A\u57FA\u4E8E\u9884\u7B97\uFF0C\u6839\u636E\u95EE\u9898\u96BE\u5EA6\u81EA\u9002\u5E94\u8C03\u6574\u601D\u8003\u957F\u77ED\u3002",
  thinkingSamplesCaption: "\u8FD9\u5F20\u8868\u683C\u5C55\u793A\u4E86\u6D4B\u8BD5\u4E2D\uFF0CGemini 3.8 Flash \u5728\u4E0D\u540C\u9884\u7B97\u4E0B\uFF0C\u5BF9\u4E0D\u540C\u96BE\u5EA6\u9898\u76EE\u7684\u5B9E\u9645\u601D\u8003\u6D88\u8017\uFF08\u5355\u4F4D\uFF1Atoken\uFF09\u3002",
  thinkingSamplesComparison: "\u586B\u5165\u6700\u5927\u503C\uFF0865535\uFF09\u4E0E\u9009 High \u5728\u56F0\u96BE\u9898\u4E0A\u5B8C\u5168\u76F8\u540C\uFF0C\u4F46\u53EF\u4EE5\u63D0\u9AD8\u7B80\u5355\u9898\u548C\u4E2D\u7B49\u9898\u7684\u601D\u8003\u7A0B\u5EA6\uFF08\u7EA6 10\u201315%\uFF09\u3002\u6570\u503C\u51B3\u5B9A\u6548\u679C\u2014\u2014\u540C\u4E00\u6570\u503C\u586B\u5728\u4EFB\u610F\u4E00\u884C\uFF0C\u53D1\u51FA\u7684\u8BF7\u6C42\u5B8C\u5168\u76F8\u540C\u3002",
  thinkingSamplesSources: "\u6CE8\uFF1A\u56F0\u96BE\u9898\u4F7F\u7528\u4E00\u9053\u7EC4\u5408\u8BA1\u6570\u63A8\u5BFC\u9898\uFF08\u63A8\u5BFC\u94FA\u7816\u9012\u63A8\u5F0F\u5E76\u6C42\u7B2C 40 \u9879\uFF09\uFF0C\u4E2D\u7B49\u9898\u4F7F\u7528\u4E00\u9053\u6570\u8BBA\u8BC1\u660E\u9898\uFF08\u8BC1\u660E n\u2074+4 \u6052\u4E3A\u5408\u6570\uFF09\uFF0C\u7B80\u5355\u9898\u4F7F\u7528\u4E00\u9053\u4E24\u4F4D\u6570\u4E58\u6CD5\u3002",
  thinkingSamplesZero: "Low \u6863\u5728\u4E2D\u7B49\u9898\u4E0A\u786E\u5B9E\u4E0D\u4EA7\u751F\u601D\u8003\uFF08\u591A\u6B21\u5B9E\u6D4B\u4E3A 0\uFF09\uFF0C\u5E76\u975E\u6570\u636E\u7F3A\u5931\u2014\u2014\u540C\u4E00\u9053\u9898\u4E0A Medium \u4E0E High \u5747\u6B63\u5E38\u601D\u8003\u3002",
  thinkingSamplesLevel: "\u8BBE\u7F6E",
  thinkingSamplesEasy: "\u7B80\u5355\u9898",
  thinkingSamplesMedium: "\u4E2D\u7B49\u9898",
  thinkingSamplesHard: "\u56F0\u96BE\u9898",
  thinkingSamplesMaxRow: "\u586B\u5165 65535",
  thinkingClaudeGroup: "Claude",
  thinkingClaudeLabel: "\u9884\u7B97",
  thinkingClaudeNoLevels: "\u65E0\u601D\u8003\u7B49\u7EA7\uFF0C\u53EA\u6709\u4E00\u4E2A\u9884\u7B97\u503C\uFF08{min}\u2013{max}\uFF09\u3002",
  thinkingClaudeMaxTokens: "\u5FC5\u987B\u5C0F\u4E8E\u5355\u6B21\u56DE\u590D\u4E0A\u9650\uFF0C\u5426\u5219\u4E0D\u53D1\u9001\u3002",
  thinkingClaudeNoReport: "\u4E0A\u6E38\u4E0D\u56DE\u62A5\u5B9E\u9645\u601D\u8003\u91CF\uFF0C\u6545\u65E0\u53C2\u8003\u8868\u3002",
  thinkingInvalid: "\u8BF7\u586B\u6574\u6570\u3002",
  modelsTitle: "\u6A21\u578B\u53EF\u89C1\u6027",
  modelsHelp: "\u5173\u95ED\u5F00\u5173\u540E\uFF0C\u8BE5\u6A21\u578B\u4E0D\u518D\u51FA\u73B0\u5728\u5BF9\u8BDD\u6846\u7684\u6A21\u578B\u9009\u62E9\u91CC\u3002\u9ED1\u540D\u5355\u5236\uFF1A\u53EA\u6709\u88AB\u5173\u95ED\u7684\u624D\u9690\u85CF\uFF0C\u670D\u52A1\u7AEF\u65B0\u589E\u7684\u6A21\u578B\u4E00\u5F8B\u9ED8\u8BA4\u663E\u793A\u3002",
  modelsHiddenSuffix: "\u5F53\u524D\u5DF2\u9690\u85CF {count} \u4E2A\u3002",
  modelToggleAria: "{name} \u662F\u5426\u5728\u6A21\u578B\u9009\u62E9\u4E2D\u663E\u793A",
  emptyModels: "\u6CA1\u6709\u53EF\u7528\u6A21\u578B\u3002\u5148\u767B\u5F55\u4E00\u4E2A\u8D26\u53F7\u3002",
  importTitle: "\u5BFC\u5165\u51ED\u636E",
  importHelp: "\u7C98\u8D34 agy auth.json\uFF0C\u6216 dsh-agy login --blob \u751F\u6210\u7684\u51ED\u636E blob\uFF1B\u591A\u884C\u53EF\u6279\u91CF\u5BFC\u5165\u3002",
  importPlaceholder: '{"token":{"access_token":"...","refresh_token":"..."}} \u6216 dsh-agy-cred-v1....\uFF08\u6BCF\u884C\u4E00\u4E2A\uFF09',
  importJson: "\u5BFC\u5165 JSON",
  importBlob: "\u5BFC\u5165 Blob",
  exportAll: "\u5BFC\u51FA\u5168\u90E8"
};
var en = {
  title: "Antigravity",
  subtitle: "Account rotation, model visibility, usage, and credentials",
  refresh: "Refresh",
  login: "Sign in",
  loading: "Loading\u2026",
  tabAccounts: "Accounts",
  tabModels: "Models",
  tabUsage: "Usage",
  tabCredentials: "Credentials",
  // Pool-eligibility state, not a usage report — see the zh note on `stateActive`.
  stateActive: "Ready",
  stateCooling: "Cooling down",
  stateVerificationRequired: "Needs verification",
  stateDisabled: "Disabled",
  coolingUntil: "Cooling until",
  verificationRetry: "Needs verification \xB7 retries {time}",
  currentAccount: "Current",
  fieldDisabled: "Disabled",
  disabledCredentials: "Credentials rejected",
  disabledSince: "disabled {ago}",
  disabledHint: "The credentials were rejected by upstream. Run Verify on this account's row to try restoring it; if that fails, sign in again to re-import.",
  noProject: "\u2014",
  valueUnknown: "\u2014",
  colAccount: "Account",
  colRequests: "Requests",
  colTime: "Time",
  colResult: "Result",
  colDuration: "Duration",
  recentTitle: "Recent requests",
  recentHelp: "Last 200 records in this process's memory (rotation events included); never persisted, never merged across processes.",
  recentEmpty: "No recent activity",
  recentOk: "ok",
  // All-time, while the Usage tab defaults to "today" — see the zh note.
  rowRequestsTotal: "{n} requests in total",
  lastActive: "active {ago}",
  liveOne: "Generating via {email} \xB7 {count} in flight",
  liveMany: "Generating \xB7 {count} in flight across {accounts} account(s)",
  fieldThroughput: "Throughput",
  throughputValue: "\u2248 {n} token/s",
  // Excludes the first-token wait — see the zh note.
  throughputNote: "after first token \xB7 cumulative",
  colActions: "Actions",
  emptyAccounts: "No accounts yet. Import one from the Credentials tab, or use Sign in above.",
  detailTitle: "Selected account",
  limitsTitle: "Limits",
  limitsUnavailable: "Not measured yet. Windows appear after the quota refresh runs for this account.",
  limitsMeasured: "measured {ago}",
  limitsRefreshOk: "Refreshed limits for {measured} account(s)",
  limitsRefreshFresh: "Limits are already fresh \u2014 nothing to refresh",
  limitsRefreshFailed: "Limit refresh failed for {failed} account(s)",
  // Spoken only when the rate would empty the window before its reset.
  limitBurnWarn: "at this rate, empty in {value}",
  quotaWindow5h: "5 hours",
  quotaWindowWeekly: "Weekly",
  fieldProject: "Project",
  fieldProxy: "Proxy",
  fieldFingerprint: "Fingerprint",
  fieldCooldownReason: "Cooldown reason",
  cooldownReasonNetworkError: "network error",
  cooldownReasonQuotaExhausted: "quota exhausted",
  cooldownReasonValidationRequired: "verification required",
  cooldownReasonProjectError: "project error",
  fieldSources: "Call sources",
  fieldLatency: "Latency",
  fieldVerification: "Verification",
  verificationOpen: "Verify now",
  verificationNoUrl: "No link from upstream \u2014 complete verification in Antigravity",
  labelLatencyAverage: "Average latency",
  labelTtft: "First token",
  proxyPlaceholder: "socks5://host:port",
  proxyDirect: "Not configured (direct)",
  fingerprintNone: "Not generated",
  fingerprintRegenerated: "Regenerated {count}\xD7 \xB7 {date}",
  latencyAverage: "avg {value}",
  latencyTtft: "first token {value}",
  sourcesSummary: "chat {chat} \xB7 CLI {cli} \xB7 verify {verify} \xB7 test {test}",
  quotaResetIn: "resets {value}",
  relNow: "shortly",
  relJustNow: "just now",
  relSeconds: "{n}s",
  relAgo: "{value} ago",
  relMinutes: "{n} min",
  relHours: "{n} h",
  relDays: "{n} d",
  relMonths: "{n} mo",
  relYears: "{n} y",
  // Sets the pool preference; does not enable a disabled account — see the zh note.
  actionActivate: "Set as current",
  actionVerify: "Verify",
  actionDelete: "Delete",
  actionTest: "Test call",
  actionExport: "Export blob",
  actionRegenerateFingerprint: "Reset fingerprint",
  actionSave: "Save",
  actionClear: "Clear",
  actionTestProxy: "Test",
  actionTestModel: "Test",
  modelTesting: "Testing\u2026",
  modelTestOk: "{model} is working.",
  modelTestFail: "{model} test failed:",
  proxyTestOk: "Proxy reachable: {proxy}",
  proxyTestFail: "Proxy unreachable: {proxy}",
  proxyTestNoTarget: "Enter a proxy address, or save one first",
  verifyOk: "Credentials valid: {email}",
  verifyFail: "Verification failed:",
  confirmDelete: "Delete this account? This cannot be undone.",
  noModelToTest: "No model available to test",
  exportFailed: "Export failed",
  importResult: "Imported {imported}, replaced {replaced}.",
  importPartial: "Imported {imported}, replaced {replaced}, {failed} failed:",
  usageCumulative: "Usage \xB7 cumulative",
  usageTitle: "Usage",
  kpiTotalTokens: "Total tokens",
  kpiTotalDetail: "{requests} requests \xB7 {failed} failed",
  kpiInput: "Input",
  kpiOutput: "Output",
  kpiCacheRead: "Cache hit",
  kpiRequests: "Requests",
  kpiInputMissed: "{tokens} missed",
  kpiInputMissedLabel: "Missed",
  kpiOutputDetail: "incl. reasoning",
  kpiCacheHit: "{percent}% of input",
  kpiNoBilledInput: "no billed input",
  kpiRequestsDetail: "{succeeded} ok \xB7 {failed} failed",
  fieldCacheWrite: "Cache write",
  fieldRateLimitRotation: "Rate limits / rotations",
  byModel: "By model",
  byAccount: "By account",
  trendTitle: "Last 7 days",
  colDay: "Day",
  colModel: "Model",
  colTokenShare: "Token share",
  colOutput: "Output",
  colToken: "Tokens",
  colFailed: "Failed",
  colRateLimited: "Rate ltd",
  colRotations: "Rotations",
  rangeToday: "Today",
  rangeWeek: "7 days",
  rangeMonth: "30 days",
  rangeAll: "All",
  since: "since {date}",
  emptyUsage: "No usage recorded yet.",
  thinkingTitle: "Thinking budget",
  thinkingDefaultAll: "default",
  thinkingConfigured: "{count} set",
  thinkingLevelLow: "Low",
  thinkingLevelMedium: "Medium",
  thinkingLevelHigh: "High",
  thinkingAuto: "default",
  thinkingChipClear: "Clear",
  thinkingGeminiGroup: "Gemini",
  thinkingGeminiHint: "A thinking budget is a hidden parameter in the API that controls how hard the model thinks. Upstream gives a few of its values names, and those names are what you see as reasoning effort (high / medium / low) in the model picker. A budget replaces the high / medium / low value that would otherwise be sent, rather than stacking with it.",
  thinkingEffectLowUp: "Make a low tier think more: put a larger value on the Low row",
  thinkingEffectHighDown: "Make a high tier think less (faster, cheaper): put a smaller value on the High row",
  thinkingEffectMax: "Maximum thinking: just select High, no value needed",
  thinkingEffectReset: "Back to that tier's default: clear the row",
  thinkingTieredLabel: "Default",
  thinkingSamplesTitle: "Measured thinking tokens",
  thinkingSamplesIntro: "The model adapts how long it thinks to the difficulty of the question, within the budget.",
  thinkingSamplesCaption: "This table shows what Gemini 3.8 Flash actually spent (in tokens) under different budgets, on questions of different difficulty.",
  thinkingSamplesComparison: "Entering the maximum (65535) is identical to selecting High on the hard question, but raises thinking on the easy and medium ones by about 10\u201315%. The value alone decides the effect \u2014 the same number entered on any row sends the same request.",
  thinkingSamplesSources: "Note: the hard question is a combinatorial derivation (derive a tiling recurrence and compute term 40), the medium one a number-theory proof (prove n\u2074+4 is always composite), and the easy one a two-digit multiplication.",
  thinkingSamplesZero: "Low genuinely produces no thinking on the medium question (0 in repeated runs) \u2014 this is not missing data; Medium and High both think normally on the same question.",
  thinkingSamplesLevel: "Setting",
  thinkingSamplesEasy: "Easy",
  thinkingSamplesMedium: "Medium",
  thinkingSamplesHard: "Hard",
  thinkingSamplesMaxRow: "entered 65535",
  thinkingClaudeGroup: "Claude",
  thinkingClaudeLabel: "Budget",
  thinkingClaudeNoLevels: "No thinking levels \u2014 a single budget value ({min}\u2013{max}).",
  thinkingClaudeMaxTokens: "Must be below the reply limit, or it is not sent.",
  thinkingClaudeNoReport: "Upstream does not report thinking tokens, so there is no reference table.",
  thinkingInvalid: "Enter a whole number.",
  modelsTitle: "Model visibility",
  modelsHelp: "Switching a model off removes it from the model picker. Blacklist semantics: only models you switch off are hidden, so models the server adds later stay visible.",
  modelsHiddenSuffix: "{count} hidden right now.",
  modelToggleAria: "Show {name} in the model picker",
  emptyModels: "No models available. Sign in to an account first.",
  importTitle: "Import credentials",
  importHelp: "Paste an agy auth.json, or a credential blob from dsh-agy login --blob. One per line for a batch import.",
  importPlaceholder: '{"token":{"access_token":"...","refresh_token":"..."}} or dsh-agy-cred-v1.... (one per line)',
  importJson: "Import JSON",
  importBlob: "Import blob",
  exportAll: "Export all"
};

// src/thinking-types.ts
var THINKING_LEVELS = ["low", "medium", "high"];
var CLAUDE_BUDGET_MIN = 1024;
var CLAUDE_BUDGET_MAX = 63999;

// src/client/index.ts
var inject = ["slots", "locale", "connection"];
var NS = "agy";
var RPC_CHANNEL = "/api";
var RPC_ENDPOINT = "agy";
var ACTION_MESSAGE_TTL_MS = 3500;
var POOL_POLL_INTERVAL_MS = 3e3;
function h(tag, props, ...children) {
  return (0, import_react.createElement)(tag, props ?? null, ...children);
}
function createRpc(connection) {
  return {
    async call(method, payload, signal) {
      const raw = await connection.rpc.call(
        RPC_CHANNEL,
        RPC_ENDPOINT,
        { method, payload },
        signal
      );
      if (raw?.ok === true) return raw.value;
      if (raw?.ok === false) throw new Error(raw.error?.message ?? `${method} failed`);
      throw new Error(`${method}: malformed RPC response`);
    }
  };
}
var TOKEN_UNITS = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"]
];
function tokenText(value) {
  if (value < 1e3) return String(value);
  const render = (scaled, suffix2) => `${scaled < 100 ? scaled.toFixed(1) : String(Math.round(scaled))}${suffix2}`;
  const start = TOKEN_UNITS.findIndex(([divisor2]) => value >= divisor2);
  for (let index = start; index >= 0; index--) {
    const [divisor2, suffix2] = TOKEN_UNITS[index];
    const scaled = Math.round(value / divisor2 * 10) / 10;
    if (scaled < 1e3) return render(scaled, suffix2);
  }
  const [divisor, suffix] = TOKEN_UNITS[0];
  return render(Math.round(value / divisor * 10) / 10, suffix);
}
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "\u2014";
  if (ms < 1e3) return `${Math.round(ms)}ms`;
  const seconds = ms / 1e3;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}m${String(whole % 60).padStart(2, "0")}s`;
}
function cacheHitPercent(counters) {
  const billed = counters.input + counters.cacheRead + counters.cacheWrite;
  if (billed <= 0) return null;
  return Math.round(counters.cacheRead / billed * 100);
}
function average(total, count) {
  return count > 0 ? total / count : 0;
}
function totalTokens(counters) {
  return counters.input + counters.output + counters.cacheRead + counters.cacheWrite;
}
function throughputTokenPerSecond(totals) {
  if (totals.latencyN === 0 || totals.ttftN === 0 || totals.output <= 0) return null;
  const decodeMs = totals.latencyMs / totals.latencyN - totals.ttftMs / totals.ttftN;
  if (decodeMs <= 0) return null;
  return Math.round(totals.output / totals.latencyN / (decodeMs / 1e3));
}
function promptTokens(counters) {
  return counters.input + counters.cacheRead + counters.cacheWrite;
}
function quotaColor(fraction) {
  if (fraction > 0.7) return "var(--dsw-alias-state-success-primary, #22c55e)";
  if (fraction >= 0.3) return "var(--dsw-alias-state-warn-primary, #f59e0b)";
  return "var(--dsw-alias-state-error-primary, #ec1313)";
}
function stateLabel(state, t) {
  switch (state) {
    case "active":
      return t("stateActive");
    case "cooling":
      return t("stateCooling");
    case "verification-required":
      return t("stateVerificationRequired");
    case "disabled":
      return t("stateDisabled");
  }
}
function levelLabel(level, t) {
  switch (level) {
    case "low":
      return t("thinkingLevelLow");
    case "medium":
      return t("thinkingLevelMedium");
    case "high":
      return t("thinkingLevelHigh");
    default:
      return level;
  }
}
function windowLabel(window2, t) {
  switch (window2) {
    case "5h":
      return t("quotaWindow5h");
    case "weekly":
      return t("quotaWindowWeekly");
    default:
      return window2;
  }
}
function burnHorizon(hours, t) {
  if (hours < 1) return t("relMinutes", { n: Math.max(1, Math.round(hours * 60)) });
  if (hours < 48) return t("relHours", { n: Math.round(hours) });
  return t("relDays", { n: Math.round(hours / 24) });
}
function clockTime(iso, lang) {
  if (iso === null) return "\u2014";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "\u2014";
  const now = /* @__PURE__ */ new Date();
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay ? date.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }) : date.toLocaleString(lang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function dayLabel(day, lang) {
  const [y, m, d] = day.split("-").map(Number);
  if (y === void 0 || m === void 0 || d === void 0 || Number.isNaN(y)) return day;
  return new Date(y, m - 1, d).toLocaleDateString(lang, { month: "short", day: "numeric" });
}
var MINUTE_MS = 6e4;
var HOUR_MS = 60 * MINUTE_MS;
var DAY_MS = 24 * HOUR_MS;
function untilText(iso, t, now) {
  if (iso === null) return "\u2014";
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return "\u2014";
  const diff = at - now;
  if (diff <= 0) return t("relNow");
  const value = diff < MINUTE_MS ? t("relNow") : diff < HOUR_MS ? t("relMinutes", { n: Math.floor(diff / MINUTE_MS) }) : diff < DAY_MS ? t("relHours", { n: Math.floor(diff / HOUR_MS) }) : diff < 30 * DAY_MS ? t("relDays", { n: Math.floor(diff / DAY_MS) }) : diff < 365 * DAY_MS ? t("relMonths", { n: Math.floor(diff / (30 * DAY_MS)) }) : t("relYears", { n: Math.floor(diff / (365 * DAY_MS)) });
  return t("quotaResetIn", { value });
}
function cooldownReasonLabel(reason, t) {
  switch (reason) {
    case "network-error":
      return t("cooldownReasonNetworkError");
    case "quota-exhausted":
      return t("cooldownReasonQuotaExhausted");
    case "validation-required":
      return t("cooldownReasonValidationRequired");
    case "project-error":
      return t("cooldownReasonProjectError");
    default:
      return reason;
  }
}
function agoText(iso, t, now) {
  if (iso === null) return "\u2014";
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return "\u2014";
  const diff = now - at;
  if (diff < MINUTE_MS) return t("relJustNow");
  const value = diff < HOUR_MS ? t("relMinutes", { n: Math.floor(diff / MINUTE_MS) }) : diff < DAY_MS ? t("relHours", { n: Math.floor(diff / HOUR_MS) }) : diff < 30 * DAY_MS ? t("relDays", { n: Math.floor(diff / DAY_MS) }) : diff < 365 * DAY_MS ? t("relMonths", { n: Math.floor(diff / (30 * DAY_MS)) }) : t("relYears", { n: Math.floor(diff / (365 * DAY_MS)) });
  return t("relAgo", { value });
}
function recentAgo(at, now, t) {
  const diff = now - at;
  if (diff < 1e4) return t("relJustNow");
  if (diff < MINUTE_MS) return t("relSeconds", { n: Math.floor(diff / 1e3) });
  return agoText(new Date(at).toISOString(), t, now);
}
function truncateIdentity(text, max = 22) {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = max - 1 - head;
  return `${text.slice(0, head)}\u2026${text.slice(-tail)}`;
}
function button(label, onClick, options = {}) {
  return h(import_dsh_client_ui_primitives.Button, {
    variant: options.variant === "danger" ? "outline" : options.variant ?? "outline",
    size: options.size === "sm" ? "sm" : "md",
    ...options.disabled === true ? { disabled: true } : {},
    ...options.title === void 0 ? {} : { title: options.title },
    ...options.variant === "danger" ? { className: "agy-btn-danger" } : {},
    onClick: (event) => {
      event?.stopPropagation?.();
      onClick();
    }
  }, label);
}
function stateBadge(state, label) {
  const dot = state === "active" ? "done" : state === "cooling" ? "warning" : "error";
  const tone = state === "active" ? "success" : state === "cooling" ? "warning" : "danger";
  return h(
    "span",
    { className: "agy-state" },
    h(import_dsh_client_ui_primitives.StateDot, { state: dot, size: 8 }),
    h(import_dsh_client_ui_primitives.Tag, { tone }, label)
  );
}
function subhead(title, aside) {
  return h(
    "div",
    { className: "agy-subhead" },
    h("span", null, title),
    aside === void 0 || aside === "" ? null : h("span", { className: "agy-aside" }, aside)
  );
}
function hint(text) {
  return h("p", { className: "agy-hint" }, text);
}
function table(headers, rows) {
  return h(
    "table",
    { className: "agy-table" },
    headers === null ? null : h("thead", null, headers),
    h("tbody", null, ...rows)
  );
}
function card(title, body, aside) {
  return h(
    "section",
    { className: "agy-card" },
    h(
      "div",
      { className: "agy-card-head" },
      h("span", { className: "agy-card-title" }, title),
      aside === void 0 ? null : h("span", { className: "agy-aside" }, aside)
    ),
    h("div", { className: "agy-card-body" }, body)
  );
}
function metrics(cells) {
  return h("div", { className: "agy-metrics" }, ...cells);
}
function metric(label, value, detail) {
  const text = typeof value === "number" ? tokenText(value) : value;
  const match = /^([\d.]+)([MK]?)$/.exec(text);
  return h(
    "div",
    { className: "agy-metric" },
    h("div", { className: "agy-metric-k" }, label),
    h(
      "div",
      { className: "agy-metric-v" },
      match === null ? text : match[1],
      match !== null && match[2] !== "" ? h("small", null, match[2]) : null
    ),
    h("div", { className: "agy-metric-d" }, detail)
  );
}
function defs(rows) {
  return h(
    "dl",
    { className: "agy-defs" },
    ...rows.flatMap(([label, value], index) => [
      h("dt", { key: `k${index}` }, label),
      h("dd", { key: `v${index}` }, value)
    ])
  );
}
function AccountDetail(props) {
  const { account, busy, handlers, t } = props;
  const [proxyDraft, setProxyDraft] = (0, import_react.useState)("");
  const usage = account.usage;
  const now = Date.now();
  const throughput = usage === null ? null : throughputTokenPerSecond(usage.totals);
  const identityRows = [
    [t("fieldProject"), account.projectId ?? t("noProject")],
    [t("fieldProxy"), h("span", { className: "agy-mono" }, account.proxy ?? t("proxyDirect"))],
    [t("fieldFingerprint"), account.fingerprint === null ? t("fingerprintNone") : t("fingerprintRegenerated", {
      count: account.fingerprintHistory,
      date: new Date(account.fingerprint.createdAt).toLocaleDateString(props.lang)
    })],
    // The age matters as much as the reason: "network error" alone reads the
    // same whether it happened seconds or days ago, which is exactly how a stale
    // value went unnoticed. The host clears expired state before rendering, so
    // this row and the state badge cannot agree to disagree. The row renders
    // ONLY while a reason is live — a permanent "—" told the reader nothing and
    // padded every healthy account.
    ...account.cooldownReason === null ? [] : [[
      t("fieldCooldownReason"),
      `${cooldownReasonLabel(account.cooldownReason, t)} \xB7 ${agoText(account.cooldownSetAt, t, now)}`
    ]],
    [t("fieldSources"), usage === null ? t("noProject") : t("sourcesSummary", {
      chat: usage.sources.chat,
      cli: usage.sources.cli,
      verify: usage.sources.verify,
      test: usage.sources.test
    })],
    [t("fieldLatency"), usage === null ? t("noProject") : `${t("latencyAverage", { value: formatDuration(average(usage.totals.latencyMs, usage.totals.latencyN)) })} \xB7 ${t("latencyTtft", { value: formatDuration(average(usage.totals.ttftMs, usage.totals.ttftN)) })}`],
    // Streaming decode rate (output over the window AFTER the first token), a
    // lifetime average — the ledger stores sums, not samples. Absent entirely
    // when nothing was timed, rather than rendering a fake 0.
    ...throughput === null ? [] : [[
      t("fieldThroughput"),
      `${t("throughputValue", { n: throughput })} \xB7 ${t("throughputNote")}`
    ]]
  ];
  if (account.state === "disabled") {
    identityRows.push([t("fieldDisabled"), account.disabledAt === null ? t("disabledCredentials") : `${t("disabledCredentials")} \xB7 ${t("disabledSince", { ago: agoText(account.disabledAt, t, now) })}`]);
  }
  if (account.verificationRequired) {
    identityRows.push([t("fieldVerification"), account.verificationUrl === null ? t("verificationNoUrl") : h("a", {
      className: "agy-link",
      href: account.verificationUrl,
      // A new tab, because the Settings section is inside the host SPA:
      // navigating away would lose the panel the user is working in.
      target: "_blank",
      rel: "noreferrer noopener"
    }, t("verificationOpen"))]);
  }
  const identity = card(
    t("detailTitle"),
    h(
      "div",
      null,
      defs(identityRows),
      account.state === "disabled" ? hint(t("disabledHint")) : null
    ),
    account.email ?? `#${account.index}`
  );
  const actions = card(t("colActions"), h(
    "div",
    { className: "agy-actions" },
    button(t("actionTest"), () => {
      handlers.onTest(account.index);
    }, { disabled: busy }),
    button(t("actionExport"), () => {
      handlers.onExport(account.index);
    }, { disabled: busy }),
    button(t("actionRegenerateFingerprint"), () => {
      handlers.onRegenerateFingerprint(account.index);
    }, { disabled: busy }),
    button(t("actionDelete"), () => {
      handlers.onDelete(account.index);
    }, { variant: "danger", disabled: busy })
  ));
  const limitsBlock = card(
    t("limitsTitle"),
    account.limits === null || account.limits.length === 0 ? h("div", { className: "agy-empty" }, t("limitsUnavailable")) : h(
      "div",
      { className: "agy-limits" },
      account.limitsUpdatedAt === null ? null : h(
        "div",
        { className: "agy-limit-age" },
        t("limitsMeasured", { ago: agoText(new Date(account.limitsUpdatedAt).toISOString(), t, now) })
      ),
      ...account.limits.map((group) => h(
        "div",
        { className: "agy-limit-group", key: group.name },
        h("div", { className: "agy-limit-group-name" }, group.name),
        ...group.windows.map((window2) => {
          const fraction = window2.remainingFraction;
          const burn = account.limitBurn?.[window2.bucketId];
          const hoursLeft = fraction !== null && burn !== void 0 && burn > 0 ? fraction / burn : null;
          const resetHours = window2.resetTime === null ? null : (new Date(window2.resetTime).getTime() - now) / HOUR_MS;
          const exhaustsFirst = hoursLeft !== null && resetHours !== null && hoursLeft < resetHours;
          return h(
            "div",
            { key: window2.bucketId },
            h(
              "div",
              { className: "agy-limit-row" },
              h("span", { className: "agy-limit-k" }, windowLabel(window2.window, t)),
              h(
                "span",
                { className: "agy-limit-track" },
                fraction === null ? null : h("i", { style: { width: `${Math.round(fraction * 100)}%`, background: quotaColor(fraction) } })
              ),
              // An unreported fraction is an em dash, never "0%": unknown
              // headroom and no headroom are opposite facts. A dedicated key
              // rather than reusing `noProject`, whose NAME would then be wrong
              // for the value it renders.
              h("span", { className: "agy-limit-p" }, fraction === null ? t("valueUnknown") : `${Math.round(fraction * 100)}%`),
              h(
                "span",
                { className: "agy-limit-reset" },
                window2.resetTime === null ? null : untilText(window2.resetTime, t, now)
              )
            ),
            exhaustsFirst ? h(
              "div",
              { className: "agy-limit-burn" },
              t("limitBurnWarn", { value: burnHorizon(hoursLeft, t) })
            ) : null
          );
        })
      ))
    )
  );
  const usageBlock = usage === null ? null : card(
    t("usageCumulative"),
    metrics([
      metric(t("kpiInput"), promptTokens(usage.totals), t("kpiInputMissed", {
        tokens: tokenText(usage.totals.input)
      })),
      metric(t("kpiOutput"), usage.totals.output, t("kpiOutputDetail")),
      metric(t("kpiCacheRead"), usage.totals.cacheRead, t("kpiCacheHit", { percent: cacheHitPercent(usage.totals) ?? 0 })),
      metric(t("kpiRequests"), String(usage.totals.requests), t("kpiRequestsDetail", {
        succeeded: usage.totals.succeeded,
        failed: usage.totals.failed
      }))
    ])
  );
  const saveProxy = () => {
    const value = proxyDraft.trim();
    if (value === "") return;
    handlers.onSetProxy(account.index, value);
    setProxyDraft("");
  };
  const proxyBlock = card(t("fieldProxy"), h(
    "div",
    { className: "agy-actions" },
    h(import_dsh_client_ui_primitives.Input, {
      value: proxyDraft,
      placeholder: t("proxyPlaceholder"),
      onChange: (event) => {
        setProxyDraft(event.target.value);
      }
    }),
    button(t("actionSave"), saveProxy, { disabled: busy || proxyDraft.trim() === "" }),
    button(t("actionClear"), () => {
      handlers.onSetProxy(account.index, "");
      setProxyDraft("");
    }, { disabled: busy || account.proxy === null }),
    // A probe needs a subject: with an empty box and no stored proxy there is
    // nothing to test, so the button is disabled with the reason on its tooltip
    // rather than clicking through to the host's "no proxy configured" error.
    (() => {
      const noTarget = proxyDraft.trim() === "" && account.proxy === null;
      return button(
        t("actionTestProxy"),
        () => {
          handlers.onTestProxy(account.index, proxyDraft.trim());
        },
        { disabled: busy || noTarget, ...noTarget ? { title: t("proxyTestNoTarget") } : {} }
      );
    })()
  ));
  return h("div", { className: "agy-detail" }, identity, actions, limitsBlock, usageBlock, proxyBlock);
}
function canActivateAccount(account) {
  return !account.active && account.state !== "disabled";
}
function resolveSelectedAccountIndex(accounts, selected) {
  if (accounts.length === 0) return 0;
  if (selected !== null) {
    if (selected >= 0 && selected < accounts.length) return selected;
    const activePos2 = accounts.findIndex((a) => a.active);
    return activePos2 >= 0 ? activePos2 : Math.min(Math.max(selected, 0), accounts.length - 1);
  }
  const activePos = accounts.findIndex((a) => a.active);
  return activePos >= 0 ? activePos : 0;
}
function AccountsTab(props) {
  const { accounts, busy, handlers, t } = props;
  const [selected, setSelected] = (0, import_react.useState)(null);
  const selectedRef = (0, import_react.useRef)(null);
  const now = Date.now();
  const liveLine = props.busyNow.length === 0 ? null : (() => {
    const total = props.busyNow.reduce((sum, entry) => sum + entry.count, 0);
    const [first] = props.busyNow;
    const subject = first === void 0 ? "" : first.email ?? `#${first.index}`;
    return h(
      "div",
      { className: "agy-live" },
      h(import_dsh_client_ui_primitives.StateDot, { state: "ongoing", size: 8 }),
      h("span", null, props.busyNow.length === 1 ? t("liveOne", { email: subject, count: total }) : t("liveMany", { count: total, accounts: props.busyNow.length }))
    );
  })();
  const index = resolveSelectedAccountIndex(accounts, selected);
  const current = accounts[index];
  (0, import_react.useEffect)(() => {
    if (selected === null) return;
    selectedRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [index, selected]);
  if (accounts.length === 0) {
    return card(t("colAccount"), h("div", { className: "agy-empty" }, t("emptyAccounts")));
  }
  const rows = accounts.map((account, at) => h(
    "div",
    {
      key: String(account.index),
      ref: at === index ? selectedRef : void 0,
      className: "agy-rowitem",
      "data-clickable": "true",
      "data-selected": at === index,
      role: "button",
      tabIndex: 0,
      "aria-pressed": at === index,
      onClick: () => {
        setSelected(at);
      },
      onKeyDown: (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setSelected(at);
      }
    },
    h(
      "div",
      { className: "agy-rowmain" },
      h(
        "div",
        { className: "agy-rowtitle" },
        h("span", { className: "agy-rowname" }, account.email ?? `#${account.index}`),
        account.active ? h(import_dsh_client_ui_primitives.Tag, { tone: "info" }, t("currentAccount")) : null
      ),
      h(
        "div",
        { className: "agy-rowmeta" },
        account.projectId ?? t("noProject"),
        account.usage === null || account.usage.totals.requests === 0 ? null : ` \xB7 ${t("rowRequestsTotal", { n: account.usage.totals.requests })}`,
        // The recency fragment: "is this account still alive" is a scan-level
        // question the all-time count cannot answer. Any source counts — a
        // verify is as much activity as a turn of chat.
        account.usage === null || account.usage.lastUsedAt === null ? null : ` \xB7 ${t("lastActive", { ago: agoText(new Date(account.usage.lastUsedAt).toISOString(), t, now) })}`
      )
    ),
    h(
      "div",
      { className: "agy-rowactions agy-rowbtns" },
      stateBadge(account.state, account.state === "cooling" ? `${t("coolingUntil")} ${clockTime(account.cooldownUntil, props.lang)}` : account.state === "verification-required" ? t("verificationRetry", { time: clockTime(account.cooldownUntil, props.lang) }) : stateLabel(account.state, t)),
      canActivateAccount(account) ? button(t("actionActivate"), () => {
        setSelected(at);
        handlers.onActivate(account.index);
      }, { size: "sm", disabled: busy }) : null,
      button(t("actionVerify"), () => {
        handlers.onVerify(account.index);
      }, { size: "sm", disabled: busy })
    )
  ));
  return h(
    "div",
    { className: "agy-root" },
    // The container-query wrapper the `.agy-split` breakpoint measures; see
    // styles.ts for why this is a container query rather than a viewport one.
    h(
      "div",
      { className: "agy-split-wrap" },
      h(
        "div",
        { className: "agy-split" },
        card(
          t("colAccount"),
          h(
            "div",
            null,
            liveLine,
            h("div", { className: "agy-rows" }, ...rows)
          ),
          `${accounts.length}`
        ),
        // `key` remounts the detail per account so its proxy draft cannot carry
        // over: without it React reuses the instance and a draft typed for one
        // account was still in the box after selecting another, one Save away
        // from writing A's proxy to B.
        //
        // `onDelete` is wrapped here, not in the shared handlers object: the
        // row-level delete used to clear the selection before acting (deletion
        // renumbers every index), and that selection state lives in THIS
        // component. Deleting from the detail's action card must behave the same.
        current === void 0 ? null : h(AccountDetail, {
          key: String(current.index),
          account: current,
          busy,
          handlers: {
            ...handlers,
            onDelete: (index2) => {
              setSelected(null);
              handlers.onDelete(index2);
            }
          },
          lang: props.lang,
          t
        })
      ),
      // The "what just happened" list, under the split: it is pool-level
      // activity, not one account's, and the split owns the full height.
      h(RecentCard, { rpc: props.rpc, t })
    )
  );
}
function orderModels(models) {
  return [...models].sort((a, b) => Number(a.disabled) - Number(b.disabled));
}
function ModelsTab(props) {
  const { models, account, pending, testing, onToggle, onTestModel, rpc, t } = props;
  const ordered = (0, import_react.useMemo)(() => orderModels(models), [models]);
  if (models.length === 0) {
    return card(t("modelsTitle"), h("div", { className: "agy-empty" }, t("emptyModels")));
  }
  const hidden = models.filter((model) => model.disabled).length;
  const rows = ordered.map((model) => h(
    "div",
    { className: "agy-rowitem", key: model.id },
    h(
      "div",
      { className: "agy-rowmain" },
      h(
        "div",
        { className: "agy-rowtitle" },
        h("span", { className: "agy-rowname" }, model.name)
      ),
      model.name === model.id ? null : h("div", { className: "agy-rowmeta agy-mono" }, model.id)
    ),
    h(
      "div",
      { className: "agy-rowactions" },
      // The host `Button` at `ghost`, not a local class: this is a quiet action
      // (one per row of a long list, so a filled capsule would read as many
      // competing primary actions), and `ghost` is the host's own variant for
      // exactly that weight. Styling it locally meant our own colors, radius and
      // focus ring, which is how this row ended up looking unlike every other
      // button in the panel.
      button(
        testing.has(model.id) ? t("modelTesting") : t("actionTestModel"),
        () => {
          onTestModel(model.id);
        },
        { size: "sm", variant: "ghost", disabled: testing.has(model.id) }
      ),
      h(import_dsh_client_ui_primitives.Switch, {
        checked: !model.disabled,
        // Only THIS switch locks while its own write is in flight. The previous
        // global `busy` disabled every control on the page for the duration of
        // two network round trips, which is what made one toggle feel like the
        // whole panel froze.
        disabled: pending.has(model.id),
        label: t("modelToggleAria", { name: model.name }),
        onChange: () => {
          onToggle(model.id, !model.disabled);
        }
      })
    )
  ));
  return h(
    "div",
    { className: "agy-root" },
    card(
      t("modelsTitle"),
      h("div", { className: "agy-rows" }, ...rows),
      hidden > 0 ? t("modelsHiddenSuffix", { count: hidden }) : account ?? void 0
    ),
    hint(t("modelsHelp")),
    h(ThinkingBudgetCard, { rpc, t })
  );
}
function thinkingRow(id, label, value, t, handlers) {
  return h(
    "div",
    { className: "agy-thinking-row", key: id },
    h("span", { className: "agy-thinking-k" }, label),
    h(import_dsh_client_ui_primitives.Input, {
      value,
      // The placeholder states what EMPTY does, not a number: a grey `1000`
      // would read as "leaving this blank gives you 1000", the opposite of the
      // real behaviour.
      placeholder: t("thinkingAuto"),
      inputMode: "numeric",
      onChange: (event) => {
        handlers.onInput(event.target.value);
      },
      onBlur: (event) => {
        handlers.onCommit(event.target.value);
      }
    }),
    handlers.chips === void 0 ? null : h("span", { className: "agy-thinking-chips" }, ...handlers.chips.map((chip) => h("button", {
      key: chip.label,
      type: "button",
      className: "agy-thinking-chip",
      // Clicking fills the field and commits in one step; the blur handler
      // then sees an unchanged value and does not save twice.
      onClick: () => {
        handlers.onInput(chip.value);
        handlers.onCommit(chip.value);
      }
    }, chip.label)))
  );
}
var THINKING_SAMPLES = [
  { level: "Default", easy: 135, medium: 1100, hard: 48700 },
  // 0, not "unreported": total - output equalled the prompt size in all 5 runs,
  // i.e. upstream really spent no thinking tokens on this combination.
  { level: "Low", easy: 50, medium: 0, hard: 9e3 },
  { level: "Medium", easy: 150, medium: 870, hard: 60400 },
  { level: "High", easy: 165, medium: 1855, hard: 63400 },
  // Independent, NOT nested under High: the same value typed into ANY row sends
  // the same request (a filled budget replaces the level token), so there is no
  // structural relationship to High — only a numerical resemblance on the hard
  // question. Users ask about this value by name, so it belongs in the grid.
  { level: "max", easy: 185, medium: 2130, hard: 62900 }
];
function ThinkingSamples({ t }) {
  const [show, setShow] = (0, import_react.useState)(false);
  const cell = (value) => h("td", { className: "agy-num" }, value === null ? "-" : value === 0 ? "0" : `~${value.toLocaleString()}`);
  return h(
    "div",
    { className: "agy-disclosure", "data-open": show },
    h(
      "button",
      {
        type: "button",
        className: "agy-disclosure-toggle",
        "aria-expanded": show,
        onClick: () => {
          setShow(!show);
        }
      },
      h("span", { className: "agy-caret" }),
      h("span", null, t("thinkingSamplesTitle"))
    ),
    show ? h(
      "div",
      { className: "agy-disclosure-body" },
      h("p", { className: "agy-hint" }, t("thinkingSamplesIntro")),
      h("p", { className: "agy-hint" }, t("thinkingSamplesCaption")),
      h(
        "div",
        { className: "agy-table-wrap" },
        table(
          h(
            "tr",
            null,
            h("th", null, t("thinkingSamplesLevel")),
            h("th", { className: "agy-num" }, t("thinkingSamplesEasy")),
            h("th", { className: "agy-num" }, t("thinkingSamplesMedium")),
            h("th", { className: "agy-num" }, t("thinkingSamplesHard"))
          ),
          THINKING_SAMPLES.map((row) => h(
            "tr",
            { key: row.level },
            // The nested row is indented so it reads as High's configuration.
            h(
              "td",
              { className: "agy-strong" },
              row.level === "max" ? t("thinkingSamplesMaxRow") : row.level
            ),
            cell(row.easy),
            cell(row.medium),
            cell(row.hard)
          ))
        )
      ),
      h("p", { className: "agy-hint agy-table-note" }, t("thinkingSamplesComparison")),
      h("p", { className: "agy-hint agy-table-note" }, t("thinkingSamplesSources")),
      // The `0` is real and reproducible, but a reader could mistake it for a
      // broken cell, so it is called out explicitly.
      h("p", { className: "agy-hint agy-table-note" }, t("thinkingSamplesZero"))
    ) : null
  );
}
function ThinkingBudgetCard(props) {
  const { rpc, t } = props;
  const [budgets, setBudgets] = (0, import_react.useState)({});
  const [tieredBudget, setTieredBudget] = (0, import_react.useState)(null);
  const [claudeBudget, setClaudeBudget] = (0, import_react.useState)(null);
  const [claudeDraft, setClaudeDraft] = (0, import_react.useState)("");
  const [drafts, setDrafts] = (0, import_react.useState)({});
  const [open, setOpen] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(void 0);
  const [loaded, setLoaded] = (0, import_react.useState)(false);
  const alive = (0, import_react.useRef)(true);
  (0, import_react.useEffect)(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = (0, import_react.useCallback)(() => {
    void (async () => {
      try {
        const result = await rpc.call("thinking.get", {});
        if (!alive.current) return;
        setBudgets(result.budgets);
        setTieredBudget(result.tieredBudget);
        setDrafts((c) => ({ ...c, tiered: result.tieredBudget === null ? "" : String(result.tieredBudget) }));
        setClaudeBudget(result.claudeBudget);
        setClaudeDraft(result.claudeBudget === null ? "" : String(result.claudeBudget));
        setDrafts(Object.fromEntries(
          THINKING_LEVELS.map((level) => [level, result.budgets[level] === void 0 ? "" : String(result.budgets[level])])
        ));
        setError(void 0);
      } catch (caught) {
        if (!alive.current) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (alive.current) setLoaded(true);
      }
    })();
  }, [rpc]);
  (0, import_react.useEffect)(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);
  const save = (level, raw) => {
    const trimmed = raw.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && !Number.isInteger(value)) {
      setError(t("thinkingInvalid"));
      return;
    }
    void (async () => {
      try {
        const result = await rpc.call("thinking.set", { level, budget: value });
        if (!alive.current) return;
        setBudgets(result.budgets);
        setError(void 0);
      } catch (caught) {
        if (!alive.current) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
  };
  const saveTiered = (raw) => {
    const trimmed = raw.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && !Number.isInteger(value)) {
      setError(t("thinkingInvalid"));
      return;
    }
    void (async () => {
      try {
        const result = await rpc.call("thinking.setTiered", { budget: value });
        if (!alive.current) return;
        setTieredBudget(result.tieredBudget);
        setError(void 0);
      } catch (caught) {
        if (!alive.current) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
  };
  const saveClaude = (raw) => {
    const trimmed = raw.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && !Number.isInteger(value)) {
      setError(t("thinkingInvalid"));
      return;
    }
    void (async () => {
      try {
        const result = await rpc.call("thinking.setClaude", { budget: value });
        if (!alive.current) return;
        setClaudeBudget(result.claudeBudget);
        setError(void 0);
      } catch (caught) {
        if (!alive.current) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
  };
  const configured = THINKING_LEVELS.filter((level) => budgets[level] !== void 0).length + (tieredBudget === null ? 0 : 1);
  const block = h(
    "div",
    { className: "agy-disclosure", "data-open": open },
    h(
      "button",
      {
        type: "button",
        className: "agy-disclosure-toggle",
        "aria-expanded": open,
        onClick: () => {
          setOpen(!open);
        }
      },
      h("span", { className: "agy-caret" }),
      h("span", null, t("thinkingTitle")),
      h(
        "span",
        { className: "agy-disclosure-meta" },
        configured === 0 ? t("thinkingDefaultAll") : t("thinkingConfigured", { count: configured })
      )
    ),
    open ? h(
      "div",
      { className: "agy-disclosure-body" },
      error === void 0 ? null : h("div", { className: "agy-error" }, error),
      // ── Gemini (tiered) ────────────────────────────────────────────────
      h(
        "div",
        { className: "agy-thinking-group" },
        h("div", { className: "agy-thinking-group-name" }, t("thinkingGeminiGroup")),
        h("p", { className: "agy-hint" }, t("thinkingGeminiHint")),
        h(
          "ul",
          { className: "agy-thinking-notes agy-thinking-effects" },
          h("li", null, t("thinkingEffectLowUp")),
          h("li", null, t("thinkingEffectHighDown")),
          h("li", null, t("thinkingEffectMax")),
          h("li", null, t("thinkingEffectReset"))
        ),
        // The selector's "Default" effort carries no level id, so it is its own
        // row rather than one of the three. Empty = upstream allocates; a value
        // = Max, a bare cap with no level sent alongside it.
        thinkingRow("tiered", t("thinkingTieredLabel"), drafts.tiered ?? "", t, {
          onInput: (value) => {
            setDrafts((c) => ({ ...c, tiered: value }));
          },
          onCommit: (value) => {
            const stored = tieredBudget === null ? "" : String(tieredBudget);
            if (value.trim() !== stored) saveTiered(value);
          },
          chips: [{ label: t("thinkingChipClear"), value: "" }]
        }),
        ...THINKING_LEVELS.map((level) => thinkingRow(level, levelLabel(level, t), drafts[level] ?? "", t, {
          onInput: (value) => {
            setDrafts((c) => ({ ...c, [level]: value }));
          },
          onCommit: (value) => {
            const stored = budgets[level] === void 0 ? "" : String(budgets[level]);
            if (value.trim() !== stored) save(level, value);
          }
        })),
        h(ThinkingSamples, { t })
      ),
      // ── Claude ─────────────────────────────────────────────────────────
      h(
        "div",
        { className: "agy-thinking-group" },
        h("div", { className: "agy-thinking-group-name" }, t("thinkingClaudeGroup")),
        // Three bullets rather than one sentence: Claude differs from Gemini on
        // three independent axes, and the last one is why no reference table is
        // offered here — upstream never reports Claude's thinking tokens, so
        // there is nothing to sample.
        h(
          "ul",
          { className: "agy-thinking-notes" },
          h("li", null, t("thinkingClaudeNoLevels", { min: CLAUDE_BUDGET_MIN, max: CLAUDE_BUDGET_MAX })),
          h("li", null, t("thinkingClaudeMaxTokens")),
          h("li", null, t("thinkingClaudeNoReport"))
        ),
        thinkingRow("claude", t("thinkingClaudeLabel"), claudeDraft, t, {
          onInput: (value) => {
            setClaudeDraft(value);
          },
          onCommit: (value) => {
            const stored = claudeBudget === null ? "" : String(claudeBudget);
            if (value.trim() !== stored) saveClaude(value);
          },
          chips: [{ label: t("thinkingChipClear"), value: "" }]
        })
      )
    ) : null
  );
  return card(t("thinkingTitle"), block);
}
function recentResultKind(entry) {
  if (entry.kind === "rotation") return "rotation";
  if (entry.rateLimited) return "limited";
  if (!entry.ok) return "fail";
  return "ok";
}
function failureReasonLabel(reason, t) {
  switch (reason) {
    case "rate-limit":
      return t("colRateLimited");
    case "network-error":
      return t("cooldownReasonNetworkError");
    case "auth-failure":
      return t("disabledCredentials");
    case "verification-required":
      return t("cooldownReasonValidationRequired");
    case "quota-exhausted":
      return t("cooldownReasonQuotaExhausted");
    case "project-error":
      return t("cooldownReasonProjectError");
    default:
      return reason;
  }
}
function recentResultText(entry, t) {
  const kind = recentResultKind(entry);
  if (kind === "rotation") {
    return entry.reason === null ? t("colRotations") : `${t("colRotations")} \xB7 ${failureReasonLabel(entry.reason, t)}`;
  }
  if (kind === "limited") return t("colRateLimited");
  if (kind === "fail") {
    return entry.reason === null || entry.reason === "rate-limit" ? t("colFailed") : `${t("colFailed")} \xB7 ${failureReasonLabel(entry.reason, t)}`;
  }
  return t("recentOk");
}
function RecentCard(props) {
  const { rpc, t } = props;
  const [open, setOpen] = (0, import_react.useState)(false);
  const [recent, setRecent] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(void 0);
  const alive = (0, import_react.useRef)(true);
  (0, import_react.useEffect)(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = (0, import_react.useCallback)(() => {
    void rpc.call("pool.recent", {}).then((result) => {
      if (alive.current) {
        setRecent(result.recent);
        setError(void 0);
      }
    }).catch((caught) => {
      if (alive.current) setError(caught instanceof Error ? caught.message : String(caught));
    });
  }, [rpc]);
  (0, import_react.useEffect)(() => {
    if (open && recent === null) load();
  }, [open, recent, load]);
  (0, import_react.useEffect)(() => {
    if (!open) return;
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, POOL_POLL_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [open, load]);
  const now = Date.now();
  return h(
    "div",
    { className: "agy-disclosure agy-recent", "data-open": open },
    h(
      "button",
      {
        type: "button",
        className: "agy-disclosure-toggle",
        "aria-expanded": open,
        onClick: () => {
          setOpen(!open);
        }
      },
      h("span", { className: "agy-caret" }),
      h("span", null, t("recentTitle")),
      recent === null ? null : h("span", { className: "agy-disclosure-meta" }, String(recent.length))
    ),
    open === false ? null : h(
      "div",
      { className: "agy-disclosure-body" },
      error === void 0 ? null : h("div", { className: "agy-error" }, error),
      hint(t("recentHelp")),
      recent === null ? h("div", { className: "agy-empty" }, t("loading")) : recent.length === 0 ? h("div", { className: "agy-empty" }, t("recentEmpty")) : h(
        "div",
        { className: "agy-table-wrap" },
        table(
          // Every column carries an explicit width: a fixed-layout table
          // with an auto column starved it to a sliver, and the identity
          // truncation below bounds content so the widths hold.
          h(
            "tr",
            null,
            h("th", { style: { width: "64px" } }, t("colTime")),
            h("th", { style: { width: "30%" } }, t("colAccount")),
            h("th", { style: { width: "24%" } }, t("colModel")),
            h("th", { style: { width: "96px" } }, t("colResult")),
            h("th", { style: { width: "56px" } }, t("colDuration")),
            h("th", { style: { width: "48px" } }, t("colOutput"))
          ),
          recent.map((entry, index) => h(
            "tr",
            { key: `${entry.at}-${index}` },
            h("td", null, recentAgo(entry.at, now, t)),
            h("td", null, h("span", {
              className: "agy-mail",
              title: entry.account ?? void 0
            }, entry.account === null ? "\u2014" : truncateIdentity(entry.account))),
            h("td", null, h("span", {
              className: "agy-mail",
              title: entry.model ?? void 0
            }, entry.model === null ? "\u2014" : truncateIdentity(entry.model))),
            h("td", null, h("span", { className: "agy-recent-state", "data-kind": recentResultKind(entry) }, recentResultText(entry, t))),
            h("td", null, entry.latencyMs === null ? "\u2014" : formatDuration(entry.latencyMs)),
            h("td", { className: "agy-num" }, entry.output === null ? "\u2014" : tokenText(entry.output))
          ))
        )
      )
    )
  );
}
var RANGE_IDS = ["today", "week", "month", "all"];
function rangeLabel(id, t) {
  switch (id) {
    case "today":
      return t("rangeToday");
    case "week":
      return t("rangeWeek");
    case "month":
      return t("rangeMonth");
    case "all":
      return t("rangeAll");
  }
}
var NUM_COL_WIDTHS = ["48px", "56px", "56px", "56px", "64px"];
function numHeader(index, label) {
  return h("th", { className: "agy-num", style: { width: NUM_COL_WIDTHS[index] } }, label);
}
function tokenComposition(counters, t) {
  const total = totalTokens(counters);
  const rows = [
    { id: "cacheRead", labelKey: "kpiCacheRead", value: counters.cacheRead, tone: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6)" },
    { id: "missed", labelKey: "kpiInputMissedLabel", value: counters.input, tone: "var(--dsw-static-neutral-bluish-700, #8b8f96)" },
    { id: "output", labelKey: "kpiOutput", value: counters.output, tone: "var(--dsw-alias-state-success-primary, #22c55e)" }
  ];
  return h("div", { className: "agy-compose" }, ...rows.map((row) => {
    const share = total > 0 ? row.value / total * 100 : 0;
    return h(
      "div",
      { className: "agy-compose-row", key: row.id },
      h("span", { className: "agy-compose-k" }, t(row.labelKey)),
      h(
        "span",
        { className: "agy-compose-track" },
        h("i", { style: { width: `${Math.max(share, row.value > 0 ? 1 : 0)}%`, background: row.tone } })
      ),
      h("span", { className: "agy-compose-v" }, tokenText(row.value)),
      h("span", { className: "agy-compose-p" }, `${share.toFixed(1)}%`)
    );
  }));
}
function UsageTab(props) {
  const { t } = props;
  const [range, setRange] = (0, import_react.useState)("today");
  const stats = props.stats;
  if (stats === null) return h("div", { className: "agy-empty" }, t("loading"));
  if (stats.all.counters.requests === 0) {
    return card(t("usageTitle"), h("div", { className: "agy-empty" }, t("emptyUsage")));
  }
  const view = range === "today" ? stats.today : range === "week" ? stats.week : range === "month" ? stats.month : stats.all;
  const counters = view.counters;
  const hit = cacheHitPercent(counters);
  const total = totalTokens(counters);
  const rangePicker = h(
    "div",
    { className: "agy-toolbar" },
    h("div", { className: "agy-chips" }, ...RANGE_IDS.map((id) => h(import_dsh_client_ui_primitives.Pill, {
      key: id,
      active: range === id,
      onClick: () => {
        setRange(id);
      }
    }, rangeLabel(id, t)))),
    h("span", { className: "agy-grow" }),
    stats.since === null ? null : h("span", { className: "agy-aside" }, t("since", { date: new Date(stats.since).toLocaleDateString(props.lang) }))
  );
  const summary = card(t("usageTitle"), h(
    "div",
    null,
    metrics([
      metric(t("kpiTotalTokens"), total, t("kpiTotalDetail", {
        requests: counters.requests,
        failed: counters.failed
      })),
      // The prompt side, whole. Its detail line states the MISSED portion, which
      // is the complement of the cache line beside it — so the two figures
      // answer "how much was cached" at a glance without either being a subset
      // the reader has to subtract for.
      metric(
        t("kpiInput"),
        promptTokens(counters),
        t("kpiInputMissed", { tokens: tokenText(counters.input) })
      ),
      metric(
        t("kpiCacheRead"),
        counters.cacheRead,
        hit === null ? t("kpiNoBilledInput") : t("kpiCacheHit", { percent: hit })
      ),
      metric(t("kpiOutput"), counters.output, t("kpiOutputDetail"))
    ]),
    tokenComposition(counters, t)
  ));
  const timing = card(t("fieldLatency"), defs([
    [t("fieldCacheWrite"), tokenText(counters.cacheWrite)],
    [t("fieldRateLimitRotation"), `${counters.rateLimited} / ${counters.rotations}`],
    [t("labelLatencyAverage"), formatDuration(average(counters.latencyMs, counters.latencyN))],
    [t("labelTtft"), formatDuration(average(counters.ttftMs, counters.ttftN))]
  ]));
  const trend = card(
    t("trendTitle"),
    h(
      "div",
      { className: "agy-table-wrap" },
      table(
        h(
          "tr",
          null,
          h("th", null, t("colDay")),
          numHeader(0, t("colRequests")),
          numHeader(1, t("colFailed")),
          numHeader(2, t("colRateLimited")),
          numHeader(3, t("colRotations"))
        ),
        stats.days.map((row) => h(
          "tr",
          { key: row.day },
          h("td", null, dayLabel(row.day, props.lang)),
          h("td", { className: "agy-num" }, String(row.requests)),
          h("td", { className: "agy-num" }, String(row.failed)),
          h("td", { className: "agy-num" }, String(row.rateLimited)),
          h("td", { className: "agy-num" }, String(row.rotations))
        ))
      )
    )
  );
  const byModel = view.models.length === 0 ? null : card(
    t("byModel"),
    h(
      "div",
      { className: "agy-table-wrap" },
      table(
        h(
          "tr",
          null,
          h("th", null, t("colModel")),
          numHeader(0, t("colRequests")),
          numHeader(1, t("kpiInput")),
          numHeader(2, t("kpiCacheRead")),
          numHeader(3, t("colOutput")),
          numHeader(4, t("colTokenShare"))
        ),
        view.models.map((row) => h(
          "tr",
          { key: row.model },
          h("td", { className: "agy-strong" }, h("span", { className: "agy-mail" }, row.model)),
          h("td", { className: "agy-num" }, String(row.counters.requests)),
          h("td", { className: "agy-num" }, tokenText(promptTokens(row.counters))),
          h("td", { className: "agy-num" }, tokenText(row.counters.cacheRead)),
          h("td", { className: "agy-num" }, tokenText(row.counters.output)),
          // Token share, not request share: every neighbouring column is tokens,
          // and the old bar silently measured requests under a "share" header, so
          // the heaviest-REQUEST row led even when it moved few tokens.
          h(
            "td",
            { className: "agy-num" },
            h(
              "span",
              { className: "agy-bar" },
              h(
                "span",
                { className: "agy-track" },
                h("i", {
                  style: {
                    width: `${Math.round(totalTokens(row.counters) / Math.max(1, total) * 100)}%`
                  }
                })
              )
            )
          )
        ))
      )
    )
  );
  const byAccount = view.accounts.length === 0 ? null : card(
    t("byAccount"),
    h(
      "div",
      { className: "agy-table-wrap" },
      table(
        h(
          "tr",
          null,
          h("th", null, t("colAccount")),
          numHeader(0, t("colRequests")),
          numHeader(1, t("colToken")),
          numHeader(2, t("colFailed")),
          numHeader(3, t("colRateLimited")),
          numHeader(4, t("colRotations"))
        ),
        view.accounts.map((row) => h(
          "tr",
          { key: row.account },
          h("td", { className: "agy-strong" }, h("span", { className: "agy-mail" }, row.account)),
          h("td", { className: "agy-num" }, String(row.counters.requests)),
          h("td", { className: "agy-num" }, tokenText(totalTokens(row.counters))),
          h("td", { className: "agy-num" }, String(row.counters.failed)),
          h("td", { className: "agy-num" }, String(row.counters.rateLimited)),
          h("td", { className: "agy-num" }, String(row.counters.rotations))
        ))
      )
    )
  );
  return h(
    "div",
    { className: "agy-root" },
    rangePicker,
    summary,
    timing,
    trend,
    byModel,
    byAccount
  );
}
function CredentialsTab(props) {
  const { t } = props;
  const [text, setText] = (0, import_react.useState)("");
  const sources = (0, import_react.useMemo)(
    () => text.split("\n").map((line) => line.trim()).filter((line) => line !== ""),
    [text]
  );
  const suffix = sources.length > 1 ? ` (${sources.length})` : "";
  return h(
    "div",
    { className: "agy-root" },
    subhead(t("importTitle")),
    hint(t("importHelp")),
    h("textarea", {
      className: "agy-textarea",
      style: { marginTop: "8px" },
      value: text,
      placeholder: t("importPlaceholder"),
      onChange: (event) => {
        setText(event.target.value);
      }
    }),
    h(
      "div",
      { className: "agy-toolbar", style: { marginTop: "8px" } },
      // Both labels go through the dictionary: hardcoded Chinese showed up in
      // the English UI and bypassed the zh/en parity check.
      button(
        `${t("importJson")}${suffix}`,
        () => {
          props.onImport("json", sources);
        },
        { disabled: props.busy || sources.length === 0 }
      ),
      button(
        `${t("importBlob")}${suffix}`,
        () => {
          props.onImport("blob", sources);
        },
        { disabled: props.busy || sources.length === 0 }
      ),
      h("span", { className: "agy-grow" }),
      button(t("exportAll"), () => {
        props.onExportAll();
      }, { disabled: props.busy })
    )
  );
}
function AgySettings(props) {
  const { rpc, t } = props;
  const [tab, setTab] = (0, import_react.useState)("accounts");
  const [accounts, setAccounts] = (0, import_react.useState)([]);
  const [models, setModels] = (0, import_react.useState)([]);
  const [modelAccount, setModelAccount] = (0, import_react.useState)(null);
  const [modelError, setModelError] = (0, import_react.useState)(void 0);
  const [toggling, setToggling] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [modelTesting, setModelTesting] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [stats, setStats] = (0, import_react.useState)(null);
  const [poolBusy, setPoolBusy] = (0, import_react.useState)([]);
  const [error, setError] = (0, import_react.useState)(void 0);
  const [notice, setNoticeState] = (0, import_react.useState)(void 0);
  const [actionError, setActionErrorState] = (0, import_react.useState)(void 0);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [loaded, setLoaded] = (0, import_react.useState)(false);
  const alive = (0, import_react.useRef)(true);
  const timedChannel = (timer, set) => (text) => {
    if (timer.current !== void 0) clearTimeout(timer.current);
    timer.current = void 0;
    set(text);
    if (text === void 0) return;
    timer.current = setTimeout(() => {
      timer.current = void 0;
      if (alive.current) set(void 0);
    }, ACTION_MESSAGE_TTL_MS);
  };
  const noticeTimer = (0, import_react.useRef)(void 0);
  const actionErrorTimer = (0, import_react.useRef)(void 0);
  const setNotice = (0, import_react.useCallback)(timedChannel(noticeTimer, setNoticeState), []);
  const setActionError = (0, import_react.useCallback)(timedChannel(actionErrorTimer, setActionErrorState), []);
  (0, import_react.useEffect)(() => () => {
    if (noticeTimer.current !== void 0) clearTimeout(noticeTimer.current);
    if (actionErrorTimer.current !== void 0) clearTimeout(actionErrorTimer.current);
  }, []);
  (0, import_react.useEffect)(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refresh = (0, import_react.useCallback)(async () => {
    const [accountOutcome, statsOutcome] = await Promise.allSettled([
      rpc.call("account.list", {}),
      rpc.call("stats.get", {})
    ]);
    if (!alive.current) return;
    if (accountOutcome.status === "fulfilled") setAccounts(accountOutcome.value.accounts);
    if (statsOutcome.status === "fulfilled") setStats(statsOutcome.value);
    const failed = [accountOutcome, statsOutcome].find((outcome) => outcome.status === "rejected");
    if (failed?.status === "rejected") {
      const caught = failed.reason;
      setError(caught instanceof Error ? caught.message : String(caught));
    } else {
      setError(void 0);
    }
    if (alive.current) setLoaded(true);
  }, [rpc]);
  const loadLimits = (0, import_react.useCallback)(async (force = false, report = false) => {
    try {
      const result = await rpc.call("account.limits", force ? { force: true } : {});
      if (!alive.current) return;
      const byIndex = new Map(result.limits.map((entry) => [entry.index, entry]));
      setAccounts((current) => current.map((account) => {
        const entry = byIndex.get(account.index);
        if (entry === void 0 || entry.groups === null) return account;
        return {
          ...account,
          limits: entry.groups,
          limitsUpdatedAt: entry.updatedAt,
          // A null rate keeps the previous one: "these two samples saw no drop"
          // is not evidence the burn stopped.
          limitBurn: entry.burn ?? account.limitBurn
        };
      }));
      if (report) {
        if (result.failed > 0) setActionError(t("limitsRefreshFailed", { failed: result.failed }));
        else if (result.measured > 0) setNotice(t("limitsRefreshOk", { measured: result.measured }));
        else setNotice(t("limitsRefreshFresh"));
      }
    } catch (caught) {
      if (report) {
        setActionError(caught instanceof Error ? caught.message : String(caught));
      }
    }
  }, [rpc, setActionError, setNotice, t]);
  (0, import_react.useEffect)(() => {
    void refresh();
  }, [refresh]);
  (0, import_react.useEffect)(() => {
    const tick = () => {
      if (document.hidden) return;
      void rpc.call("pool.status", {}).then((result) => {
        if (alive.current) setPoolBusy(result.busy);
      }).catch(() => {
      });
    };
    tick();
    const timer = setInterval(tick, POOL_POLL_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [rpc]);
  (0, import_react.useEffect)(() => {
    if (tab === "accounts" && accounts.length > 0) void loadLimits();
  }, [tab, accounts.length, loadLimits]);
  const refreshAll = (0, import_react.useCallback)(() => {
    void refresh();
    if (tab === "accounts") void loadLimits(true, true);
  }, [loadLimits, refresh, tab]);
  const loadModels = (0, import_react.useCallback)(async () => {
    try {
      const result = await rpc.call("model.list", {});
      if (!alive.current) return;
      setModels(result.models);
      setModelAccount(result.account);
      setModelError(void 0);
    } catch (caught) {
      if (!alive.current) return;
      setModelError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [rpc]);
  (0, import_react.useEffect)(() => {
    void loadModels();
  }, [loadModels]);
  (0, import_react.useEffect)(() => {
    if (tab === "models" && models.length === 0) void loadModels();
  }, [tab, models.length, loadModels]);
  const act = (0, import_react.useCallback)(async (run) => {
    setBusy(true);
    setNotice(void 0);
    try {
      await run();
      await refresh();
      setError(void 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [refresh]);
  const startLogin = (0, import_react.useCallback)(() => {
    setBusy(true);
    rpc.call("auth.url", {}).then((result) => {
      window.open(result.url, "agy-oauth", "width=520,height=680");
      setError(void 0);
    }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    }).finally(() => {
      if (alive.current) setBusy(false);
    });
  }, [rpc]);
  (0, import_react.useEffect)(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "agy_login_success") void refresh();
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [refresh]);
  const copyText = (0, import_react.useCallback)(async (text) => {
    await navigator.clipboard?.writeText(text);
  }, []);
  const runAction = (0, import_react.useCallback)(async (run) => {
    setBusy(true);
    setNotice(void 0);
    setActionError(void 0);
    try {
      await run();
    } catch (caught) {
      if (alive.current) {
        setActionError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [setActionError, setNotice]);
  const handlers = (0, import_react.useMemo)(() => ({
    t,
    onActivate: (index) => {
      void act(() => rpc.call("account.activate", { index }));
    },
    onVerify: (index) => {
      void runAction(async () => {
        const result = await rpc.call("account.verify", { index });
        if (alive.current) await refresh();
        if (!alive.current) return;
        if (result.ok) setNotice(t("verifyOk", { email: result.email ?? `#${index}` }));
        else setActionError(t("verifyFail") + (result.error === void 0 ? "" : `
${result.error}`));
      });
    },
    onDelete: (index) => {
      if (!window.confirm(t("confirmDelete"))) return;
      void act(() => rpc.call("account.delete", { index }));
    },
    onTest: (index) => {
      void runAction(async () => {
        const listed = models.length > 0 ? models : (await rpc.call("model.list", {})).models;
        const target = listed.find((entry) => !entry.disabled)?.id;
        if (target === void 0) throw new Error(t("noModelToTest"));
        const result = await rpc.call("account.test", { model: target, index });
        if (alive.current) await refresh();
        if (!alive.current) return;
        if (result.ok) setNotice(t("modelTestOk", { model: target }));
        else setActionError(t("modelTestFail", { model: target }) + (result.error === void 0 ? "" : `
${result.error}`));
      });
    },
    onExport: (index) => {
      void act(async () => {
        const result = await rpc.call("account.export", { index });
        if (result.blob === void 0) throw new Error(result.error ?? t("exportFailed"));
        await copyText(result.blob);
      });
    },
    onRegenerateFingerprint: (index) => {
      void act(() => rpc.call("account.fingerprint", { index, action: "regenerate" }));
    },
    onSetProxy: (index, proxy) => {
      void act(() => rpc.call("account.proxy", { index, proxy }));
    },
    /**
     * Probe the proxy and REPORT the verdict.
     *
     * `account.proxyTest` answers in band (`{ ok, masked, error? }`) and only
     * throws for a request-level failure, so the in-band verdict is read here
     * rather than left to `act()`. No `refresh()`: the probe mutates no account
     * state, so reloading would be a second `account.list` + `stats.get` round
     * trip bought for nothing.
     */
    onTestProxy: (index, proxy) => {
      void runAction(async () => {
        const result = await rpc.call("account.proxyTest", {
          index,
          ...proxy === "" ? {} : { proxy }
        });
        if (!alive.current) return;
        if (result.ok) setNotice(t("proxyTestOk", { proxy: result.masked }));
        else setActionError(t("proxyTestFail", { proxy: result.masked }) + (result.error === void 0 ? "" : `
${result.error}`));
      });
    }
  }), [act, copyText, models, refresh, rpc, runAction, setActionError, setNotice, t]);
  const tabButton = (id, label, count) => h("button", {
    key: id,
    type: "button",
    className: "agy-tab",
    "data-active": tab === id,
    onClick: () => {
      setTab(id);
    }
  }, label, count === void 0 ? null : h("span", { className: "agy-count" }, String(count)));
  const body = tab === "accounts" ? h(AccountsTab, { accounts, busy, busyNow: poolBusy, handlers, lang: props.lang, rpc, t }) : tab === "models" ? modelError === void 0 ? h(ModelsTab, {
    models,
    account: modelAccount,
    // The quota panel answers the same question as the visibility list
    // ("which models can I use, how much is left"), so it lives here. It is
    // read from the active account's row, which is the only one the host
    // queries (see management.ts listAccounts).
    pending: toggling,
    testing: modelTesting,
    rpc,
    t,
    /**
     * Optimistic, per-model toggle.
     *
     * The old handler ran the write AND a full `model.list` reload through
     * `act()`, so a click cost two network round trips (the reload reaches
     * upstream model discovery) while a single global `busy` flag disabled
     * every control on the page — hence "it hangs, everything is disabled,
     * then it switches". The write is authoritative and its result is
     * already known, so the list is updated from the response and no
     * reload is needed: the switch reflects exactly what the host stored.
     */
    onToggle: (modelId, disabled) => {
      setToggling((current) => new Set(current).add(modelId));
      void (async () => {
        try {
          const result = await rpc.call("model.setDisabled", { modelId, disabled });
          if (!alive.current) return;
          setModels((current) => current.map((model) => model.id === result.modelId ? { ...model, disabled: result.disabled } : model));
          setError(void 0);
        } catch (caught) {
          if (!alive.current) return;
          setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
          if (alive.current) {
            setToggling((current) => {
              const next = new Set(current);
              next.delete(modelId);
              return next;
            });
          }
        }
      })();
    },
    /**
     * One billed test call against exactly this model, reported in the
     * shared notice line (OK) or error banner (failure). The result must
     * not be silent: a test that shows nothing looks like nothing ran.
     */
    onTestModel: (modelId) => {
      setError(void 0);
      setNotice(void 0);
      setModelTesting((current) => new Set(current).add(modelId));
      void (async () => {
        try {
          const result = await rpc.call("account.test", { model: modelId });
          if (!alive.current) return;
          if (result.ok) {
            setNotice(t("modelTestOk", { model: modelId }));
          } else {
            setError(t("modelTestFail", { model: modelId }) + (result.error ? `
${result.error}` : ""));
          }
        } catch (caught) {
          if (!alive.current) return;
          setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
          if (alive.current) {
            setModelTesting((current) => {
              const next = new Set(current);
              next.delete(modelId);
              return next;
            });
          }
        }
      })();
    }
  }) : h(
    "div",
    { className: "agy-root" },
    h("div", { className: "agy-error" }, modelError),
    button(t("refresh"), () => {
      void loadModels();
    }, { size: "sm" })
  ) : tab === "usage" ? h(UsageTab, { stats, lang: props.lang, t }) : h(CredentialsTab, {
    busy,
    t,
    onImport: (kind, sources) => {
      void act(async () => {
        const result = await rpc.call("account.import", { kind, sources });
        if (result.errors.length > 0) {
          setNotice(`${t("importPartial", {
            imported: result.imported,
            replaced: result.replaced,
            failed: result.errors.length
          })}
${result.errors.join("\n")}`);
        } else {
          setNotice(t("importResult", {
            imported: result.imported,
            replaced: result.replaced
          }));
        }
      });
    },
    onExportAll: () => {
      void act(async () => {
        const { blobs } = await rpc.call("account.exportAll", {});
        await copyText(blobs.map((entry) => entry.blob).join("\n"));
      });
    }
  });
  return h(
    "div",
    { className: "agy-root" },
    h(
      "div",
      { className: "agy-head" },
      h(
        "div",
        null,
        h("div", { className: "agy-title" }, "Antigravity"),
        h("div", { className: "agy-sub" }, t("subtitle"))
      ),
      h(
        "div",
        { className: "agy-toolbar" },
        // Both header actions use the host's `outline` variant — the same one
        // Refresh already used. They are equal-weight utility actions, so they
        // must look identical; an earlier pass gave Login `toolbar` (a filled
        // variant) to avoid the near-white `primary` slab, which fixed that
        // button but left the pair visibly mismatched. Copying Refresh is the
        // correct answer: `outline` is a bordered transparent capsule that reads
        // correctly in both themes, and it needs no token reasoning of ours.
        button(t("refresh"), refreshAll, { size: "sm", disabled: busy }),
        button(t("login"), startLogin, { size: "sm", disabled: busy })
      )
    ),
    h(
      "div",
      { className: "agy-tabs" },
      tabButton("accounts", t("tabAccounts"), accounts.length),
      tabButton("models", t("tabModels"), models.length > 0 ? models.length : void 0),
      tabButton("usage", t("tabUsage")),
      tabButton("credentials", t("tabCredentials"))
    ),
    error === void 0 ? null : h("div", { className: "agy-error" }, error),
    // The action's own verdict, in the same red as a standing error because it
    // IS one — it simply expires, since the page is still usable and the user
    // already knows what they clicked. `pre-wrap` is not inherited from
    // `.agy-notice`, so the two-line "what failed + why" form relies on the
    // stylesheet keeping newlines (see `.agy-error`).
    actionError === void 0 ? null : h("div", { className: "agy-error" }, actionError),
    notice === void 0 ? null : h("div", { className: "agy-notice" }, notice),
    body,
    loaded || error !== void 0 ? null : h("div", { className: "agy-empty" }, t("loading"))
  );
}
function apply(ctx) {
  ctx.effect(() => installAgyStyles(), "dsh-agy: styles");
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-agy: dictionaries");
  const connection = ctx.get("connection");
  if (connection === void 0) {
    ctx.logger.warn("[dsh-agy] connection service unavailable \u2014 Antigravity settings not registered");
    return;
  }
  const rpc = createRpc(connection);
  const t = ctx.locale.bind(NS);
  const lang = ctx.locale.getLocale?.().active;
  ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "agy",
    order: 30,
    locale: NS,
    label: () => t("title")
  }, () => h(AgySettings, { rpc, t, lang }))), "dsh-agy: Settings section");
}
return module.exports; } });
