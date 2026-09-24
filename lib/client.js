window.__ModuleLoader__.load({
	id: "dsh-agy",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/client/styles.ts
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
		const STYLE_ID = "dsh-agy-styles";
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

/* ── Token composition ─────────────────────────────────────────────────────
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

/* ── 5h / weekly limits ────────────────────────────────────────────────────
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
`;
		/** Install the stylesheet once (idempotent across plugin reloads). */
		function installAgyStyles() {
			if (typeof document === "undefined") return () => {};
			if (document.getElementById(STYLE_ID) !== null) return () => {
				document.getElementById(STYLE_ID)?.remove();
			};
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			document.head.appendChild(style);
			return () => {
				document.getElementById(STYLE_ID)?.remove();
			};
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Bilingual copy for the agy Settings section.
		*
		* Registered through the host's locale service (`ctx.locale.register`), so the
		* section follows DSH's own language setting instead of carrying a private
		* language switch. Keys are typed, and the `zh` and `en` dictionaries must stay
		* key-for-key identical (a test enforces it).
		*/
		const zh = {
			title: "Antigravity",
			subtitle: "账号轮换、模型可见性、用量与凭据",
			refresh: "刷新",
			login: "登录",
			loading: "加载中…",
			tabAccounts: "账号",
			tabModels: "模型",
			tabUsage: "用量",
			tabCredentials: "凭据",
			stateActive: "使用中",
			stateCooling: "冷却中",
			stateVerificationRequired: "待验证",
			stateDisabled: "已停用",
			coolingUntil: "冷却至",
			currentAccount: "当前账号",
			noProject: "—",
			valueUnknown: "—",
			colAccount: "账号",
			colRequests: "请求",
			colActions: "操作",
			emptyAccounts: "还没有账号。切到「凭据」标签导入，或点击上方「登录」。",
			detailTitle: "已选账号",
			limitsTitle: "限额",
			limitsUnavailable: "尚未测量。配额按账号定期刷新后显示。",
			limitsMeasured: "测量于 {ago}",
			limitsRefreshOk: "已刷新 {measured} 个账号的限额",
			limitsRefreshFresh: "限额仍是新鲜的，无需刷新",
			limitsRefreshFailed: "{failed} 个账号的限额刷新失败",
			quotaWindow5h: "5 小时",
			quotaWindowWeekly: "每周",
			fieldProject: "项目",
			fieldProxy: "代理",
			fieldFingerprint: "指纹",
			fieldCooldownReason: "冷却原因",
			cooldownReasonNetworkError: "网络错误",
			cooldownReasonQuotaExhausted: "额度耗尽",
			cooldownReasonValidationRequired: "需要验证",
			cooldownReasonProjectError: "项目错误",
			fieldSources: "调用来源",
			fieldLatency: "延迟",
			fieldVerification: "验证",
			verificationOpen: "前往验证",
			verificationNoUrl: "上游未提供链接，请在 Antigravity 中完成验证",
			labelLatencyAverage: "平均延迟",
			labelTtft: "首 token",
			proxyPlaceholder: "socks5://host:port",
			proxyDirect: "未配置（直连）",
			fingerprintNone: "未生成",
			fingerprintRegenerated: "已重建 {count} 次 · {date}",
			latencyAverage: "平均 {value}",
			latencyTtft: "首 token {value}",
			sourcesSummary: "对话 {chat} · CLI {cli} · 验证 {verify} · 测试 {test}",
			quotaResetIn: "重置 {value}",
			relNow: "即将",
			relJustNow: "刚刚",
			relAgo: "{value}前",
			relMinutes: "{n} 分钟",
			relHours: "{n} 小时",
			relDays: "{n} 天",
			relMonths: "{n} 个月",
			relYears: "{n} 年",
			actionActivate: "激活",
			actionVerify: "验证",
			actionDelete: "删除",
			actionTest: "测试调用",
			actionExport: "导出 Blob",
			actionRegenerateFingerprint: "重置指纹",
			actionSave: "保存",
			actionClear: "清除",
			actionTestProxy: "测试",
			actionTestModel: "测试",
			modelTesting: "测试中…",
			modelTestOk: "{model} 可用。",
			modelTestFail: "{model} 测试失败：",
			proxyTestOk: "代理可达：{proxy}",
			proxyTestFail: "代理不可达：{proxy}",
			proxyTestNoTarget: "先填写代理地址，或保存一个代理",
			verifyOk: "凭证有效：{email}",
			verifyFail: "验证失败：",
			confirmDelete: "删除这个账号？此操作不可撤销。",
			noModelToTest: "没有可用于测试的模型",
			exportFailed: "导出失败",
			importResult: "导入 {imported} 个，覆盖 {replaced} 个。",
			importPartial: "导入 {imported} 个，覆盖 {replaced} 个，失败 {failed} 个：",
			usageCumulative: "用量 · 累计",
			usageTitle: "用量",
			kpiTotalTokens: "总 Token",
			kpiTotalDetail: "{requests} 次请求 · 失败 {failed}",
			kpiInput: "输入",
			kpiOutput: "输出",
			kpiCacheRead: "缓存命中",
			kpiRequests: "请求",
			kpiInputMissed: "未命中 {tokens}",
			kpiInputMissedLabel: "未命中",
			kpiOutputDetail: "含推理",
			kpiCacheHit: "占输入 {percent}%",
			kpiNoBilledInput: "无计费输入",
			kpiRequestsDetail: "成功 {succeeded} · 失败 {failed}",
			fieldCacheWrite: "缓存写",
			fieldRateLimitRotation: "限流 / 轮换",
			byModel: "按模型",
			byAccount: "按账号",
			colModel: "模型",
			colTokenShare: "Token 占比",
			colOutput: "输出",
			colToken: "Token",
			colFailed: "失败",
			colRateLimited: "限流",
			colRotations: "轮换",
			rangeToday: "今日",
			rangeWeek: "7 天",
			rangeMonth: "30 天",
			rangeAll: "全部",
			since: "自 {date} 起",
			emptyUsage: "还没有用量记录。",
			thinkingTitle: "思考预算",
			thinkingDefaultAll: "默认",
			thinkingConfigured: "{count} 项已设置",
			thinkingLevelLow: "低",
			thinkingLevelMedium: "中",
			thinkingLevelHigh: "高",
			thinkingAuto: "默认",
			thinkingChipClear: "清空",
			thinkingGeminiGroup: "Gemini",
			thinkingGeminiHint: "思考预算是 API 里的一个隐藏参数，用来控制模型思考的努力程度。上游给其中几个取值起了名字，这就是你在模型选择器里看到的 reasoning effort（high / medium / low）。填入预算会替换掉原本的 high / medium / low 传给模型，而不是叠加。",
			thinkingEffectLowUp: "让低档想得更多：在 Low 行填入较大数值",
			thinkingEffectHighDown: "让高档想得更少（更快、更省）：在 High 行填入较小数值",
			thinkingEffectMax: "获得最大思考：直接选 High，不必填值",
			thinkingEffectReset: "恢复该档默认：清空该行",
			thinkingTieredLabel: "Default",
			thinkingSamplesTitle: "实测思考量参考",
			thinkingSamplesIntro: "模型会基于预算，根据问题难度自适应调整思考长短。",
			thinkingSamplesCaption: "这张表格展示了测试中，Gemini 3.8 Flash 在不同预算下，对不同难度题目的实际思考消耗（单位：token）。",
			thinkingSamplesComparison: "填入最大值（65535）与选 High 在困难题上完全相同，但可以提高简单题和中等题的思考程度（约 10–15%）。数值决定效果——同一数值填在任意一行，发出的请求完全相同。",
			thinkingSamplesSources: "注：困难题使用一道组合计数推导题（推导铺砖递推式并求第 40 项），中等题使用一道数论证明题（证明 n⁴+4 恒为合数），简单题使用一道两位数乘法。",
			thinkingSamplesZero: "Low 档在中等题上确实不产生思考（多次实测为 0），并非数据缺失——同一道题上 Medium 与 High 均正常思考。",
			thinkingSamplesLevel: "设置",
			thinkingSamplesEasy: "简单题",
			thinkingSamplesMedium: "中等题",
			thinkingSamplesHard: "困难题",
			thinkingSamplesMaxRow: "填入 65535",
			thinkingClaudeGroup: "Claude",
			thinkingClaudeLabel: "预算",
			thinkingClaudeNoLevels: "无思考等级，只有一个预算值（{min}–{max}）。",
			thinkingClaudeMaxTokens: "必须小于单次回复上限，否则不发送。",
			thinkingClaudeNoReport: "上游不回报实际思考量，故无参考表。",
			thinkingInvalid: "请填整数。",
			modelsTitle: "模型可见性",
			modelsHelp: "关闭开关后，该模型不再出现在对话框的模型选择里。黑名单制：只有被关闭的才隐藏，服务端新增的模型一律默认显示。",
			modelsHiddenSuffix: "当前已隐藏 {count} 个。",
			modelToggleAria: "{name} 是否在模型选择中显示",
			emptyModels: "没有可用模型。先登录一个账号。",
			importTitle: "导入凭据",
			importHelp: "粘贴 agy auth.json，或 dsh-agy login --blob 生成的凭据 blob；多行可批量导入。",
			importPlaceholder: "{\"token\":{\"access_token\":\"...\",\"refresh_token\":\"...\"}} 或 dsh-agy-cred-v1....（每行一个）",
			importJson: "导入 JSON",
			importBlob: "导入 Blob",
			exportAll: "导出全部"
		};
		const en = {
			title: "Antigravity",
			subtitle: "Account rotation, model visibility, usage, and credentials",
			refresh: "Refresh",
			login: "Sign in",
			loading: "Loading…",
			tabAccounts: "Accounts",
			tabModels: "Models",
			tabUsage: "Usage",
			tabCredentials: "Credentials",
			stateActive: "Active",
			stateCooling: "Cooling down",
			stateVerificationRequired: "Needs verification",
			stateDisabled: "Disabled",
			coolingUntil: "Cooling until",
			currentAccount: "current",
			noProject: "—",
			valueUnknown: "—",
			colAccount: "Account",
			colRequests: "Requests",
			colActions: "Actions",
			emptyAccounts: "No accounts yet. Import one from the Credentials tab, or use Sign in above.",
			detailTitle: "Selected account",
			limitsTitle: "Limits",
			limitsUnavailable: "Not measured yet. Windows appear after the quota refresh runs for this account.",
			limitsMeasured: "measured {ago}",
			limitsRefreshOk: "Refreshed limits for {measured} account(s)",
			limitsRefreshFresh: "Limits are already fresh — nothing to refresh",
			limitsRefreshFailed: "Limit refresh failed for {failed} account(s)",
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
			verificationNoUrl: "No link from upstream — complete verification in Antigravity",
			labelLatencyAverage: "Average latency",
			labelTtft: "First token",
			proxyPlaceholder: "socks5://host:port",
			proxyDirect: "Not configured (direct)",
			fingerprintNone: "Not generated",
			fingerprintRegenerated: "Regenerated {count}× · {date}",
			latencyAverage: "avg {value}",
			latencyTtft: "first token {value}",
			sourcesSummary: "chat {chat} · CLI {cli} · verify {verify} · test {test}",
			quotaResetIn: "resets {value}",
			relNow: "shortly",
			relJustNow: "just now",
			relAgo: "{value} ago",
			relMinutes: "{n} min",
			relHours: "{n} h",
			relDays: "{n} d",
			relMonths: "{n} mo",
			relYears: "{n} y",
			actionActivate: "Activate",
			actionVerify: "Verify",
			actionDelete: "Delete",
			actionTest: "Test call",
			actionExport: "Export blob",
			actionRegenerateFingerprint: "Reset fingerprint",
			actionSave: "Save",
			actionClear: "Clear",
			actionTestProxy: "Test",
			actionTestModel: "Test",
			modelTesting: "Testing…",
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
			usageCumulative: "Usage · cumulative",
			usageTitle: "Usage",
			kpiTotalTokens: "Total tokens",
			kpiTotalDetail: "{requests} requests · {failed} failed",
			kpiInput: "Input",
			kpiOutput: "Output",
			kpiCacheRead: "Cache hit",
			kpiRequests: "Requests",
			kpiInputMissed: "{tokens} missed",
			kpiInputMissedLabel: "Missed",
			kpiOutputDetail: "incl. reasoning",
			kpiCacheHit: "{percent}% of input",
			kpiNoBilledInput: "no billed input",
			kpiRequestsDetail: "{succeeded} ok · {failed} failed",
			fieldCacheWrite: "Cache write",
			fieldRateLimitRotation: "Rate limits / rotations",
			byModel: "By model",
			byAccount: "By account",
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
			thinkingSamplesComparison: "Entering the maximum (65535) is identical to selecting High on the hard question, but raises thinking on the easy and medium ones by about 10–15%. The value alone decides the effect — the same number entered on any row sends the same request.",
			thinkingSamplesSources: "Note: the hard question is a combinatorial derivation (derive a tiling recurrence and compute term 40), the medium one a number-theory proof (prove n⁴+4 is always composite), and the easy one a two-digit multiplication.",
			thinkingSamplesZero: "Low genuinely produces no thinking on the medium question (0 in repeated runs) — this is not missing data; Medium and High both think normally on the same question.",
			thinkingSamplesLevel: "Setting",
			thinkingSamplesEasy: "Easy",
			thinkingSamplesMedium: "Medium",
			thinkingSamplesHard: "Hard",
			thinkingSamplesMaxRow: "entered 65535",
			thinkingClaudeGroup: "Claude",
			thinkingClaudeLabel: "Budget",
			thinkingClaudeNoLevels: "No thinking levels — a single budget value ({min}–{max}).",
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
			importPlaceholder: "{\"token\":{\"access_token\":\"...\",\"refresh_token\":\"...\"}} or dsh-agy-cred-v1.... (one per line)",
			importJson: "Import JSON",
			importBlob: "Import blob",
			exportAll: "Export all"
		};
		//#endregion
		//#region src/thinking-types.ts
		/**
		* Thinking-budget vocabulary shared by the host store, the RPC wire contract,
		* and the browser UI.
		*
		* Split out for the same reason `usage-types.ts` exists: these types live on
		* their own, free of any `node:*` import, so the browser bundle can describe the
		* settings surface without pulling in the host's storage module. Putting them in
		* `thinking-budget.ts` instead made `rpc-contract.ts` (which the client
		* typechecks) reach `node:fs` through the transitive import — caught by
		* `tsconfig.client.json`, which includes the contract and excludes `src/store`.
		*/
		/** The three levels a tiered model exposes, in display order. */
		const THINKING_LEVELS = [
			"low",
			"medium",
			"high"
		];
		/**
		* The Claude family's `thinkingBudget` bounds, measured separately from Gemini's.
		*
		* The two families do NOT share a contract, which is why one interval cannot
		* serve both:
		*   - Claude's floor is **1024**, not `-1`. A budget of 1 or 512 is rejected with
		*     `thinking.enabled.budget_tokens: Input should be greater than or equal to
		*     1024`; `-1` and `0` are accepted as special values.
		*   - Claude additionally requires **`max_tokens` strictly greater than the
		*     budget**: `budget=1024, max_tokens=1024` is a 400, and a budget sent with
		*     no `maxOutputTokens` at all also fails. So the margin is at least one token.
		*
		* `CLAUDE_BUDGET_MAX` is therefore one below `AGY_CLAUDE_MAX_OUTPUT_TOKENS` — the
		* largest budget that can still leave room for a strictly greater `max_tokens`.
		*/
		const CLAUDE_BUDGET_MIN = 1024;
		const CLAUDE_BUDGET_MAX = 63999;
		//#endregion
		//#region src/client/index.ts
		/**
		* agy Settings section — the browser half.
		*
		* One `settings.section` page with four tabs (accounts, models, usage,
		* credentials), replacing the standalone `/agy` dashboard. Every figure comes
		* from the `/api/agy` RPC over `ctx.connection`, so this section needs no
		* host-rendered page and there is no second UI to keep in step.
		*
		* Elements are built through the local `h` helper rather than JSX or nested
		* `createElement` calls: this package configures no JSX transform for the client
		* bundle, and `h(tag, props, ...children)` keeps the element tree flat and
		* readable where nested `createElement` calls become a parenthesis maze.
		*/
		/** Required browser services: the slot registry, dictionaries, and the RPC carrier. */
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		/** Dictionary namespace this plugin owns. */
		const NS = "agy";
		/** RPC channel and endpoint the host registers as `/api/agy`. */
		const RPC_CHANNEL = "/api";
		const RPC_ENDPOINT = "agy";
		/**
		* How long a one-shot action's verdict stays on screen.
		*
		* Both the success and the failure channel use this: an action's outcome is a
		* transient acknowledgement, and the screen is in a valid state either way. A
		* STANDING failure (the account list failing to load) deliberately does not use
		* it — see `actionError` in `AgySettings`.
		*/
		const ACTION_MESSAGE_TTL_MS = 3500;
		function h(tag, props, ...children) {
			return (0, react.createElement)(tag, props ?? null, ...children);
		}
		/** Call one management method and unwrap the Connection RPC envelope. */
		function createRpc(connection) {
			return { async call(method, payload, signal) {
				const raw = await connection.rpc.call(RPC_CHANNEL, RPC_ENDPOINT, {
					method,
					payload
				}, signal);
				if (raw?.ok === true) return raw.value;
				if (raw?.ok === false) throw new Error(raw.error?.message ?? `${method} failed`);
				throw new Error(`${method}: malformed RPC response`);
			} };
		}
		/** Compact token text: 1.2M / 284K / 512. */
		/** Token-count units, largest first. */
		const TOKEN_UNITS = [
			[0xe8d4a51000, "T"],
			[1e9, "B"],
			[1e6, "M"],
			[1e3, "K"]
		];
		/**
		* Compact token count: `1.2M` / `284K` / `512`. Counts below 1000 render in
		* full — a suffix starts at 1K.
		*
		* The unit is chosen from the value ROUNDED TO ITS DISPLAYED PRECISION, and
		* promoted when that rounding would reach 1000 (which belongs to the next unit).
		* Deciding from the raw magnitude let rounding contradict the suffix: 999_999
		* printed as `1000K`, 99999 as `100.0K` while 100000 was `100K`, and 9999999 as
		* `10.0M` while 10000000 was `10M`.
		*
		* Exported for a direct unit test: the boundaries are exactly where this broke.
		* @param value - token count.
		* @returns the display string.
		*/
		function tokenText(value) {
			if (value < 1e3) return String(value);
			/** One decimal below 100 (`1.2M`), none at or above (`284K`). */
			const render = (scaled, suffix) => `${scaled < 100 ? scaled.toFixed(1) : String(Math.round(scaled))}${suffix}`;
			const start = TOKEN_UNITS.findIndex(([divisor]) => value >= divisor);
			for (let index = start; index >= 0; index--) {
				const [divisor, suffix] = TOKEN_UNITS[index];
				const scaled = Math.round(value / divisor * 10) / 10;
				if (scaled < 1e3) return render(scaled, suffix);
			}
			const [divisor, suffix] = TOKEN_UNITS[0];
			return render(Math.round(value / divisor * 10) / 10, suffix);
		}
		function formatDuration(ms) {
			if (!Number.isFinite(ms) || ms <= 0) return "—";
			if (ms < 1e3) return `${Math.round(ms)}ms`;
			const seconds = ms / 1e3;
			if (seconds < 60) return `${seconds.toFixed(1)}s`;
			const whole = Math.round(seconds);
			return `${Math.floor(whole / 60)}m${String(whole % 60).padStart(2, "0")}s`;
		}
		/** Cache-hit share of prompt-side input; null when nothing was billed. */
		function cacheHitPercent(counters) {
			const billed = counters.input + counters.cacheRead + counters.cacheWrite;
			if (billed <= 0) return null;
			return Math.round(counters.cacheRead / billed * 100);
		}
		function average(total, count) {
			return count > 0 ? total / count : 0;
		}
		/** Total tokens across the four disjoint buckets. */
		function totalTokens(counters) {
			return counters.input + counters.output + counters.cacheRead + counters.cacheWrite;
		}
		/**
		* The whole prompt side: everything the model read, cached or not.
		*
		* The LEDGER keeps `input` as the uncached portion alone, because that is DSH's
		* own disjoint-bucket vocabulary (`usage-types.ts`, and the adapter's SSE parse
		* subtracts the cached count for exactly this reason) — that split must not be
		* redefined at the storage layer.
		*
		* The DISPLAY folds it, though: an input figure of 18.6M beside a cache figure
		* of 62.2M reads as though 62.2M went unaccounted for, and a cache read LARGER
		* than the input looks like a bug rather than the expected shape of a prefix
		* cache. So the headline shows the whole prompt side and the cache line becomes
		* a HIT count — a subset, which is why the two are never added together and the
		* old explanatory footnote is gone.
		* @param counters - one scope's counters.
		* @returns prompt tokens including the cached portion.
		*/
		function promptTokens(counters) {
			return counters.input + counters.cacheRead + counters.cacheWrite;
		}
		/** Quota tint by remaining fraction: healthy / low / critical. */
		function quotaColor(fraction) {
			if (fraction > .7) return "var(--dsw-alias-state-success-primary, #22c55e)";
			if (fraction >= .3) return "var(--dsw-alias-state-warn-primary, #f59e0b)";
			return "var(--dsw-alias-state-error-primary, #ec1313)";
		}
		/** Localized account-state label. */
		function stateLabel(state, t) {
			switch (state) {
				case "active": return t("stateActive");
				case "cooling": return t("stateCooling");
				case "verification-required": return t("stateVerificationRequired");
				case "disabled": return t("stateDisabled");
			}
		}
		/**
		* Localized label for a reasoning level.
		*
		* Falls back to the raw id so a level added upstream is still usable rather than
		* rendering blank.
		*/
		function levelLabel(level, t) {
			switch (level) {
				case "low": return t("thinkingLevelLow");
				case "medium": return t("thinkingLevelMedium");
				case "high": return t("thinkingLevelHigh");
				default: return level;
			}
		}
		/**
		* Localized label for an upstream quota window token.
		*
		* Upstream sends `5h` / `weekly` today. The tokens are mapped rather than
		* printed so the panel follows the UI language, and an UNRECOGNIZED token falls
		* back to its raw value: upstream may add a window, and showing `30d` is better
		* than a blank or a wrong localized label.
		*/
		function windowLabel(window, t) {
			switch (window) {
				case "5h": return t("quotaWindow5h");
				case "weekly": return t("quotaWindowWeekly");
				default: return window;
			}
		}
		/**
		* A wall-clock moment for a state label (a cooldown end).
		*
		* Time-of-day alone is enough while the wall is today; past midnight it must
		* carry the date, or a 24h quota cooldown reads as though it ends in a few
		* minutes. (`untilText` is the relative form, used where "how long from now" is
		* the question rather than "when".)
		*/
		function clockTime(iso) {
			if (iso === null) return "—";
			const date = new Date(iso);
			if (Number.isNaN(date.getTime())) return "—";
			const now = /* @__PURE__ */ new Date();
			return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate() ? date.toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit"
			}) : date.toLocaleString([], {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit"
			});
		}
		const MINUTE_MS = 6e4;
		const HOUR_MS = 60 * MINUTE_MS;
		const DAY_MS = 24 * HOUR_MS;
		/**
		* Time until a future moment, as localized copy.
		*
		* A quota reset wall is often more than 24h out, so a bare `HH:mm` cannot say
		* whether it means today or tomorrow — the failure this replaces. Bucket
		* boundaries mirror the host's `relativeTime` (which is defined for past-dated
		* rows and would need its arguments reversed to serve a future one, so the
		* comparison is written out here instead); the words stay in this plugin's own
		* dictionary, which is exactly the split that API intends.
		*/
		function untilText(iso, t, now) {
			if (iso === null) return "—";
			const at = new Date(iso).getTime();
			if (Number.isNaN(at)) return "—";
			const diff = at - now;
			if (diff <= 0) return t("relNow");
			return t("quotaResetIn", { value: diff < MINUTE_MS ? t("relNow") : diff < HOUR_MS ? t("relMinutes", { n: Math.floor(diff / MINUTE_MS) }) : diff < DAY_MS ? t("relHours", { n: Math.floor(diff / HOUR_MS) }) : diff < 30 * DAY_MS ? t("relDays", { n: Math.floor(diff / DAY_MS) }) : diff < 365 * DAY_MS ? t("relMonths", { n: Math.floor(diff / (30 * DAY_MS)) }) : t("relYears", { n: Math.floor(diff / (365 * DAY_MS)) }) });
		}
		/**
		* Localized label for a cooldown reason.
		*
		* Falls back to the raw token so a reason added on the host side still renders
		* something legible rather than blank.
		*/
		function cooldownReasonLabel(reason, t) {
			switch (reason) {
				case "network-error": return t("cooldownReasonNetworkError");
				case "quota-exhausted": return t("cooldownReasonQuotaExhausted");
				case "validation-required": return t("cooldownReasonValidationRequired");
				case "project-error": return t("cooldownReasonProjectError");
				default: return reason;
			}
		}
		/**
		* How long ago a past moment was (the mirror of `untilText`).
		*
		* Reuses the same `rel*` magnitudes so the two read consistently, but adds a
		* direction suffix: a bare magnitude beside a cooldown could equally mean when
		* it started or when it ends. The suffix and every magnitude come from the
		* dictionary, so nothing here is language-specific.
		*/
		function agoText(iso, t, now) {
			if (iso === null) return "—";
			const at = new Date(iso).getTime();
			if (Number.isNaN(at)) return "—";
			const diff = now - at;
			if (diff < MINUTE_MS) return t("relJustNow");
			return t("relAgo", { value: diff < HOUR_MS ? t("relMinutes", { n: Math.floor(diff / MINUTE_MS) }) : diff < DAY_MS ? t("relHours", { n: Math.floor(diff / HOUR_MS) }) : diff < 30 * DAY_MS ? t("relDays", { n: Math.floor(diff / DAY_MS) }) : diff < 365 * DAY_MS ? t("relMonths", { n: Math.floor(diff / (30 * DAY_MS)) }) : t("relYears", { n: Math.floor(diff / (365 * DAY_MS)) }) });
		}
		/**
		* A host-styled button.
		*
		* Delegates to the host's `Button` so focus rings, disabled states, size tiers
		* and theming are the platform's rather than an imitation. `danger` has no
		* primitive equivalent, so it keeps the ghost family with a local class.
		*
		* Every click stops propagating. Account rows are themselves click targets
		* (selecting the row), so without this a row's "Delete"/"Verify"/"Activate"
		* button also selected that row — and for Delete the row indices then shifted
		* underneath a selection that was about to be acted on. Stopping unconditionally
		* is safe for buttons outside rows, where there is no ancestor handler.
		*/
		function button(label, onClick, options = {}) {
			return h(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
		/** Full-width quota row used by the (collapsible) model quota list. */
		/** Account state rendered with the host's state dot plus a tinted tag. */
		function stateBadge(state, label) {
			const dot = state === "active" ? "done" : state === "cooling" ? "warning" : "error";
			const tone = state === "active" ? "success" : state === "cooling" ? "warning" : "danger";
			return h("span", { className: "agy-state" }, h(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
				state: dot,
				size: 8
			}), h(_deepseek_ai_dsh_client_ui_primitives.Tag, { tone }, label));
		}
		function subhead(title, aside) {
			return h("div", { className: "agy-subhead" }, h("span", null, title), aside === void 0 || aside === "" ? null : h("span", { className: "agy-aside" }, aside));
		}
		function hint(text) {
			return h("p", { className: "agy-hint" }, text);
		}
		function table(headers, rows) {
			return h("table", { className: "agy-table" }, headers === null ? null : h("thead", null, headers), h("tbody", null, ...rows));
		}
		/** A titled grouping surface. Grouping is what keeps a dense page readable. */
		function card(title, body, aside) {
			return h("section", { className: "agy-card" }, h("div", { className: "agy-card-head" }, h("span", { className: "agy-card-title" }, title), aside === void 0 ? null : h("span", { className: "agy-aside" }, aside)), h("div", { className: "agy-card-body" }, body));
		}
		/** A metric strip inside a card. */
		function metrics(cells) {
			return h("div", { className: "agy-metrics" }, ...cells);
		}
		/** One metric cell: a label, a large value, and an optional detail line. */
		function metric(label, value, detail) {
			const text = typeof value === "number" ? tokenText(value) : value;
			const match = /^([\d.]+)([MK]?)$/.exec(text);
			return h("div", { className: "agy-metric" }, h("div", { className: "agy-metric-k" }, label), h("div", { className: "agy-metric-v" }, match === null ? text : match[1], match !== null && match[2] !== "" ? h("small", null, match[2]) : null), h("div", { className: "agy-metric-d" }, detail));
		}
		/** Definition rows: label/value pairs with hairline separators. */
		function defs(rows) {
			return h("dl", { className: "agy-defs" }, ...rows.flatMap(([label, value], index) => [h("dt", { key: `k${index}` }, label), h("dd", { key: `v${index}` }, value)]));
		}
		/** One account's detail: identity, cumulative usage, proxy, and its actions. */
		function AccountDetail(props) {
			const { account, busy, handlers, t } = props;
			const [proxyDraft, setProxyDraft] = (0, react.useState)("");
			const usage = account.usage;
			const now = Date.now();
			const identityRows = [
				[t("fieldProject"), account.projectId ?? t("noProject")],
				[t("fieldProxy"), h("span", { className: "agy-mono" }, account.proxy ?? t("proxyDirect"))],
				[t("fieldFingerprint"), account.fingerprint === null ? t("fingerprintNone") : t("fingerprintRegenerated", {
					count: account.fingerprintHistory,
					date: new Date(account.fingerprint.createdAt).toLocaleDateString()
				})],
				[t("fieldCooldownReason"), account.cooldownReason === null ? t("noProject") : `${cooldownReasonLabel(account.cooldownReason, t)} · ${agoText(account.cooldownSetAt, t, now)}`],
				[t("fieldSources"), usage === null ? t("noProject") : t("sourcesSummary", {
					chat: usage.sources.chat,
					cli: usage.sources.cli,
					verify: usage.sources.verify,
					test: usage.sources.test
				})],
				[t("fieldLatency"), usage === null ? t("noProject") : `${t("latencyAverage", { value: formatDuration(average(usage.totals.latencyMs, usage.totals.latencyN)) })} · ${t("latencyTtft", { value: formatDuration(average(usage.totals.ttftMs, usage.totals.ttftN)) })}`]
			];
			if (account.verificationRequired) identityRows.push([t("fieldVerification"), account.verificationUrl === null ? t("verificationNoUrl") : h("a", {
				className: "agy-link",
				href: account.verificationUrl,
				target: "_blank",
				rel: "noreferrer noopener"
			}, t("verificationOpen"))]);
			const identity = card(t("detailTitle"), defs(identityRows), account.email ?? `#${account.index}`);
			const actions = card(t("colActions"), h("div", { className: "agy-actions" }, button(t("actionTest"), () => {
				handlers.onTest(account.index);
			}, { disabled: busy }), button(t("actionExport"), () => {
				handlers.onExport(account.index);
			}, { disabled: busy }), button(t("actionRegenerateFingerprint"), () => {
				handlers.onRegenerateFingerprint(account.index);
			}, { disabled: busy })));
			/**
			* The 5-hour / weekly windows, placed ABOVE the cumulative usage card.
			*
			* Ordering is deliberate: these are the figures a user actually acts on
			* (the rolling budget still available), while cumulative usage is a
			* retrospective total that only grows. Putting the actionable number first is
			* the whole point of the panel.
			*
			* A window with no reported fraction renders its bar empty and its percentage
			* as an em dash — "unknown" must not look like "0% left". A null `limits` means
			* the account has not been measured YET, and says so rather than showing an
			* empty card. That is reachable at any pool size: `refreshLimits` runs for a
			* solo account too (unlike the scheduling quota refresh, which a pool of one
			* skips because measuring it could block the only account).
			*/
			const limitsBlock = card(t("limitsTitle"), account.limits === null || account.limits.length === 0 ? h("div", { className: "agy-empty" }, t("limitsUnavailable")) : h("div", { className: "agy-limits" }, account.limitsUpdatedAt === null ? null : h("div", { className: "agy-limit-age" }, t("limitsMeasured", { ago: agoText(new Date(account.limitsUpdatedAt).toISOString(), t, now) })), ...account.limits.map((group) => h("div", {
				className: "agy-limit-group",
				key: group.name
			}, h("div", { className: "agy-limit-group-name" }, group.name), ...group.windows.map((window) => {
				const fraction = window.remainingFraction;
				return h("div", {
					className: "agy-limit-row",
					key: window.bucketId
				}, h("span", { className: "agy-limit-k" }, windowLabel(window.window, t)), h("span", { className: "agy-limit-track" }, fraction === null ? null : h("i", { style: {
					width: `${Math.round(fraction * 100)}%`,
					background: quotaColor(fraction)
				} })), h("span", { className: "agy-limit-p" }, fraction === null ? t("valueUnknown") : `${Math.round(fraction * 100)}%`), h("span", { className: "agy-limit-reset" }, window.resetTime === null ? null : untilText(window.resetTime, t, now)));
			})))));
			const usageBlock = usage === null ? null : card(t("usageCumulative"), metrics([
				metric(t("kpiInput"), promptTokens(usage.totals), t("kpiInputMissed", { tokens: tokenText(usage.totals.input) })),
				metric(t("kpiOutput"), usage.totals.output, t("kpiOutputDetail")),
				metric(t("kpiCacheRead"), usage.totals.cacheRead, t("kpiCacheHit", { percent: cacheHitPercent(usage.totals) ?? 0 })),
				metric(t("kpiRequests"), String(usage.totals.requests), t("kpiRequestsDetail", {
					succeeded: usage.totals.succeeded,
					failed: usage.totals.failed
				}))
			]));
			const saveProxy = () => {
				const value = proxyDraft.trim();
				if (value === "") return;
				handlers.onSetProxy(account.index, value);
				setProxyDraft("");
			};
			return h("div", { className: "agy-detail" }, identity, actions, limitsBlock, usageBlock, card(t("fieldProxy"), h("div", { className: "agy-actions" }, h(_deepseek_ai_dsh_client_ui_primitives.Input, {
				value: proxyDraft,
				placeholder: t("proxyPlaceholder"),
				onChange: (event) => {
					setProxyDraft(event.target.value);
				}
			}), button(t("actionSave"), saveProxy, { disabled: busy || proxyDraft.trim() === "" }), button(t("actionClear"), () => {
				handlers.onSetProxy(account.index, "");
				setProxyDraft("");
			}, { disabled: busy || account.proxy === null }), (() => {
				const noTarget = proxyDraft.trim() === "" && account.proxy === null;
				return button(t("actionTestProxy"), () => {
					handlers.onTestProxy(account.index, proxyDraft.trim());
				}, {
					disabled: busy || noTarget,
					...noTarget ? { title: t("proxyTestNoTarget") } : {}
				});
			})())));
		}
		function AccountsTab(props) {
			const { accounts, busy, handlers, t } = props;
			const [selected, setSelected] = (0, react.useState)(0);
			if (accounts.length === 0) return card(t("colAccount"), h("div", { className: "agy-empty" }, t("emptyAccounts")));
			const index = Math.min(selected, accounts.length - 1);
			const current = accounts[index];
			const rows = accounts.map((account, at) => h("div", {
				key: String(account.index),
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
			}, h("div", { className: "agy-rowmain" }, h("div", { className: "agy-rowtitle" }, h("span", { className: "agy-rowname" }, account.email ?? `#${account.index}`), account.active ? h(_deepseek_ai_dsh_client_ui_primitives.Tag, { tone: "info" }, t("currentAccount")) : null), h("div", { className: "agy-rowmeta" }, account.projectId ?? t("noProject"), account.usage === null || account.usage.totals.requests === 0 ? null : ` · ${t("colRequests")} ${account.usage.totals.requests}`)), h("div", { className: "agy-rowactions" }, stateBadge(account.state, account.state === "cooling" ? `${t("coolingUntil")} ${clockTime(account.cooldownUntil)}` : stateLabel(account.state, t)), account.active ? null : button(t("actionActivate"), () => {
				handlers.onActivate(account.index);
			}, {
				size: "sm",
				disabled: busy
			}), button(t("actionVerify"), () => {
				handlers.onVerify(account.index);
			}, {
				size: "sm",
				disabled: busy
			}), button(t("actionDelete"), () => {
				handlers.onDelete(account.index);
			}, {
				size: "sm",
				variant: "danger",
				disabled: busy
			}))));
			return h("div", { className: "agy-root" }, h("div", { className: "agy-split-wrap" }, h("div", { className: "agy-split" }, card(t("colAccount"), h("div", { className: "agy-rows" }, ...rows), `${accounts.length}`), current === void 0 ? null : h(AccountDetail, {
				key: String(current.index),
				account: current,
				busy,
				handlers,
				t
			}))));
		}
		/**
		* Models tab: per-model visibility switches, plus the account's model quota in a
		* collapsible block.
		*
		* Quota lives here rather than in the account list because both answer the same
		* question — "which models can I use, and how much is left" — and the quota list
		* is long (20+ rows), so it must not push the account list off screen. The
		* disclosure keeps it one click away without spending the space by default.
		*/
		/**
		* Order models for display: enabled first, disabled sunk to the bottom.
		*
		* Exported for a direct unit test — the rule is pure and worth pinning, and the
		* client test harness does not render. Stable by construction: `Array.sort` is
		* stable per spec, so the host's own order survives inside each group. That is
		* what makes a toggle move exactly one row instead of reshuffling the list.
		* @param models - the host's list, in host order.
		* @returns a new array, enabled models first.
		*/
		function orderModels(models) {
			return [...models].sort((a, b) => Number(a.disabled) - Number(b.disabled));
		}
		function ModelsTab(props) {
			const { models, account, pending, testing, onToggle, onTestModel, rpc, t } = props;
			const ordered = (0, react.useMemo)(() => orderModels(models), [models]);
			if (models.length === 0) return card(t("modelsTitle"), h("div", { className: "agy-empty" }, t("emptyModels")));
			const hidden = models.filter((model) => model.disabled).length;
			const rows = ordered.map((model) => h("div", {
				className: "agy-rowitem",
				key: model.id
			}, h("div", { className: "agy-rowmain" }, h("div", { className: "agy-rowtitle" }, h("span", { className: "agy-rowname" }, model.name)), model.name === model.id ? null : h("div", { className: "agy-rowmeta agy-mono" }, model.id)), h("div", { className: "agy-rowactions" }, button(testing.has(model.id) ? t("modelTesting") : t("actionTestModel"), () => {
				onTestModel(model.id);
			}, {
				size: "sm",
				variant: "ghost",
				disabled: testing.has(model.id)
			}), h(_deepseek_ai_dsh_client_ui_primitives.Switch, {
				checked: !model.disabled,
				disabled: pending.has(model.id),
				label: t("modelToggleAria", { name: model.name }),
				onChange: () => {
					onToggle(model.id, !model.disabled);
				}
			}))));
			return h("div", { className: "agy-root" }, card(t("modelsTitle"), h("div", { className: "agy-rows" }, ...rows), hidden > 0 ? t("modelsHiddenSuffix", { count: hidden }) : account ?? void 0), hint(t("modelsHelp")), h(ThinkingBudgetCard, {
				rpc,
				t
			}));
		}
		/**
		* The global reasoning-level token budgets.
		*
		* One row per level rather than per model: only `*-tiered` models send a
		* `thinkingConfig` at all, and the level itself is already chosen in DSH's model
		* selector. So this supplies the missing VALUE behind each level — the same three
		* numbers for every such model.
		*
		* An EMPTY input is the meaningful default: the request then sends
		* `thinkingLevel` and lets upstream pick, which is exactly the behaviour before
		* this setting existed. That is why the field is not a `number` input with a
		* zero fallback, and why clearing it is a real action rather than "set to 0"
		* (measured: `0` reduces thinking but does not reliably disable it).
		*/
		/**
		* One budget row: label, input, and optional shortcut chips.
		*
		* There is deliberately NO trailing text column. An earlier version put the wire
		* form there ("sends thinkingLevel: high"), which was wrong twice over: on the
		* "High" row it restated that row's own label, and `thinkingLevel` /
		* `thinkingBudget` are identifiers for us rather than words a user needs. The
		* input plus its label carry all the information the row has.
		*
		* `chips` are shortcuts, not a second control: they only fill the input, and the
		* empty one is the meaningful default (upstream allocates).
		*/
		function thinkingRow(id, label, value, t, handlers) {
			return h("div", {
				className: "agy-thinking-row",
				key: id
			}, h("span", { className: "agy-thinking-k" }, label), h(_deepseek_ai_dsh_client_ui_primitives.Input, {
				value,
				placeholder: t("thinkingAuto"),
				inputMode: "numeric",
				onChange: (event) => {
					handlers.onInput(event.target.value);
				},
				onBlur: (event) => {
					handlers.onCommit(event.target.value);
				}
			}), handlers.chips === void 0 ? null : h("span", { className: "agy-thinking-chips" }, ...handlers.chips.map((chip) => h("button", {
				key: chip.label,
				type: "button",
				className: "agy-thinking-chip",
				onClick: () => {
					handlers.onInput(chip.value);
					handlers.onCommit(chip.value);
				}
			}, chip.label))));
		}
		/**
		* Measured thinking-token samples, one row per effort THE PICKER ACTUALLY OFFERS.
		*
		* The rows are exactly the picker's entries — Default, Low, Medium, High — and
		* nothing else. `Max` is deliberately absent: it was a chip that filled the input
		* with the maximum, and measurement showed it buys nothing. At the model's real
		* ceiling (65536) `high` reaches ~63k, i.e. 96% of it, so there is no higher
		* ceiling for a bigger number to unlock.
		*
		* WHY A TABLE AND NOT A SENTENCE. These numbers only mean anything compared
		* DOWN a column: `High` spends ~165 tokens on `17*23` and ~63,000 on a hard
		* derivation. A sentence listing both is unreadable, and a single number per tier
		* reads as a fixed value when the real behaviour is a range.
		*
		* MEASUREMENT TRAP, recorded because it wasted a full investigation: thinking and
		* output SHARE `maxOutputTokens` (measured exactly — cap 2048 gave 1962 thoughts
		* + 82 output = 2044). A harness that pins the cap below the thinking demand
		* measures its own pin. Six runs at cap 60000 all reported ~24k regardless of
		* level and looked like "the tiers are equivalent"; at cap 65536 they separate.
		* The hard column below was re-measured at the ceiling. `pnpm run
		* verify:thinking-levels` re-derives all of it.
		*
		* A `0` is a MEASURED ZERO, not a placeholder: on the medium prompt `Low`
		* returned no `thoughtsTokenCount` field at all, and `total - output` equalled
		* the prompt size in all 5 runs — upstream really spent no thinking tokens. It is
		* printed as `0` rather than `-` so the row does not look like missing data.
		*
		* Every value is the mean of 2-11 live samples, rounded. `Default`'s hard cell
		* carried only 2 samples (34k and 57k, 51% apart) until four more were taken:
		* 6 samples now give ~48,700 at sd ~8,800. The spread is why these are labelled
		* samples and not a specification.
		*/
		const THINKING_SAMPLES = [
			{
				level: "Default",
				easy: 135,
				medium: 1100,
				hard: 48700
			},
			{
				level: "Low",
				easy: 50,
				medium: 0,
				hard: 9e3
			},
			{
				level: "Medium",
				easy: 150,
				medium: 870,
				hard: 60400
			},
			{
				level: "High",
				easy: 165,
				medium: 1855,
				hard: 63400
			},
			{
				level: "max",
				easy: 185,
				medium: 2130,
				hard: 62900
			}
		];
		/**
		* Collapsible table of measured thinking tokens.
		*
		* MUST be rendered as a component (`h(ThinkingSamples, { t })`), never CALLED as
		* `ThinkingSamples({ t })` or as a lowercase helper. This function owns a
		* `useState`, and React keys renderer state by hook call order: a direct call
		* inside the parent's conditional branch appends this hook to the PARENT's
		* sequence, so the parent's hook count changes the moment the section expands and
		* React throws mid-render. The exception unmounts the whole Settings tree — a
		* white panel no click can revive, only a restart.
		*
		* This is the second occurrence of that class of bug in this file (`ModelsTab`
		* ran a `useMemo` after an early return, white-screening on tab switch). Both
		* passed `tsc`, the 442 unit tests and CI, because the test environment is
		* `environment: 'node'` and renders nothing — nothing static checks hook order.
		*/
		function ThinkingSamples({ t }) {
			const [show, setShow] = (0, react.useState)(false);
			const cell = (value) => h("td", { className: "agy-num" }, value === null ? "-" : value === 0 ? "0" : `~${value.toLocaleString()}`);
			return h("div", {
				className: "agy-disclosure",
				"data-open": show
			}, h("button", {
				type: "button",
				className: "agy-disclosure-toggle",
				"aria-expanded": show,
				onClick: () => {
					setShow(!show);
				}
			}, h("span", { className: "agy-caret" }), h("span", null, t("thinkingSamplesTitle"))), show ? h("div", { className: "agy-disclosure-body" }, h("p", { className: "agy-hint" }, t("thinkingSamplesIntro")), h("p", { className: "agy-hint" }, t("thinkingSamplesCaption")), h("div", { className: "agy-table-wrap" }, table(h("tr", null, h("th", null, t("thinkingSamplesLevel")), h("th", { className: "agy-num" }, t("thinkingSamplesEasy")), h("th", { className: "agy-num" }, t("thinkingSamplesMedium")), h("th", { className: "agy-num" }, t("thinkingSamplesHard"))), THINKING_SAMPLES.map((row) => h("tr", { key: row.level }, h("td", { className: "agy-strong" }, row.level === "max" ? t("thinkingSamplesMaxRow") : row.level), cell(row.easy), cell(row.medium), cell(row.hard))))), h("p", { className: "agy-hint agy-table-note" }, t("thinkingSamplesComparison")), h("p", { className: "agy-hint agy-table-note" }, t("thinkingSamplesSources")), h("p", { className: "agy-hint agy-table-note" }, t("thinkingSamplesZero"))) : null);
		}
		function ThinkingBudgetCard(props) {
			const { rpc, t } = props;
			const [budgets, setBudgets] = (0, react.useState)({});
			const [tieredBudget, setTieredBudget] = (0, react.useState)(null);
			const [claudeBudget, setClaudeBudget] = (0, react.useState)(null);
			const [claudeDraft, setClaudeDraft] = (0, react.useState)("");
			const [drafts, setDrafts] = (0, react.useState)({});
			const [open, setOpen] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(void 0);
			const [loaded, setLoaded] = (0, react.useState)(false);
			const alive = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
				};
			}, []);
			const load = (0, react.useCallback)(() => {
				(async () => {
					try {
						const result = await rpc.call("thinking.get", {});
						if (!alive.current) return;
						setBudgets(result.budgets);
						setTieredBudget(result.tieredBudget);
						setDrafts((c) => ({
							...c,
							tiered: result.tieredBudget === null ? "" : String(result.tieredBudget)
						}));
						setClaudeBudget(result.claudeBudget);
						setClaudeDraft(result.claudeBudget === null ? "" : String(result.claudeBudget));
						setDrafts(Object.fromEntries(THINKING_LEVELS.map((level) => [level, result.budgets[level] === void 0 ? "" : String(result.budgets[level])])));
						setError(void 0);
					} catch (caught) {
						if (!alive.current) return;
						setError(caught instanceof Error ? caught.message : String(caught));
					} finally {
						if (alive.current) setLoaded(true);
					}
				})();
			}, [rpc]);
			(0, react.useEffect)(() => {
				if (open && !loaded) load();
			}, [
				open,
				loaded,
				load
			]);
			const save = (level, raw) => {
				const trimmed = raw.trim();
				const value = trimmed === "" ? null : Number(trimmed);
				if (value !== null && !Number.isInteger(value)) {
					setError(t("thinkingInvalid"));
					return;
				}
				(async () => {
					try {
						const result = await rpc.call("thinking.set", {
							level,
							budget: value
						});
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
				(async () => {
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
				(async () => {
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
			const block = h("div", {
				className: "agy-disclosure",
				"data-open": open
			}, h("button", {
				type: "button",
				className: "agy-disclosure-toggle",
				"aria-expanded": open,
				onClick: () => {
					setOpen(!open);
				}
			}, h("span", { className: "agy-caret" }), h("span", null, t("thinkingTitle")), h("span", { className: "agy-disclosure-meta" }, configured === 0 ? t("thinkingDefaultAll") : t("thinkingConfigured", { count: configured }))), open ? h("div", { className: "agy-disclosure-body" }, error === void 0 ? null : h("div", { className: "agy-error" }, error), h("div", { className: "agy-thinking-group" }, h("div", { className: "agy-thinking-group-name" }, t("thinkingGeminiGroup")), h("p", { className: "agy-hint" }, t("thinkingGeminiHint")), h("ul", { className: "agy-thinking-notes agy-thinking-effects" }, h("li", null, t("thinkingEffectLowUp")), h("li", null, t("thinkingEffectHighDown")), h("li", null, t("thinkingEffectMax")), h("li", null, t("thinkingEffectReset"))), thinkingRow("tiered", t("thinkingTieredLabel"), drafts.tiered ?? "", t, {
				onInput: (value) => {
					setDrafts((c) => ({
						...c,
						tiered: value
					}));
				},
				onCommit: (value) => {
					const stored = tieredBudget === null ? "" : String(tieredBudget);
					if (value.trim() !== stored) saveTiered(value);
				},
				chips: [{
					label: t("thinkingChipClear"),
					value: ""
				}]
			}), ...THINKING_LEVELS.map((level) => thinkingRow(level, levelLabel(level, t), drafts[level] ?? "", t, {
				onInput: (value) => {
					setDrafts((c) => ({
						...c,
						[level]: value
					}));
				},
				onCommit: (value) => {
					const stored = budgets[level] === void 0 ? "" : String(budgets[level]);
					if (value.trim() !== stored) save(level, value);
				}
			})), h(ThinkingSamples, { t })), h("div", { className: "agy-thinking-group" }, h("div", { className: "agy-thinking-group-name" }, t("thinkingClaudeGroup")), h("ul", { className: "agy-thinking-notes" }, h("li", null, t("thinkingClaudeNoLevels", {
				min: CLAUDE_BUDGET_MIN,
				max: CLAUDE_BUDGET_MAX
			})), h("li", null, t("thinkingClaudeMaxTokens")), h("li", null, t("thinkingClaudeNoReport"))), thinkingRow("claude", t("thinkingClaudeLabel"), claudeDraft, t, {
				onInput: (value) => {
					setClaudeDraft(value);
				},
				onCommit: (value) => {
					const stored = claudeBudget === null ? "" : String(claudeBudget);
					if (value.trim() !== stored) saveClaude(value);
				},
				chips: [{
					label: t("thinkingChipClear"),
					value: ""
				}]
			}))) : null);
			return card(t("thinkingTitle"), block);
		}
		const RANGE_IDS = [
			"today",
			"week",
			"month",
			"all"
		];
		/** Localized label for one range chip. */
		function rangeLabel(id, t) {
			switch (id) {
				case "today": return t("rangeToday");
				case "week": return t("rangeWeek");
				case "month": return t("rangeMonth");
				case "all": return t("rangeAll");
			}
		}
		/**
		* Fixed widths for the numeric columns, shared by BOTH breakdown tables.
		*
		* They must be identical across the two tables. `table-layout: fixed` gives the
		* auto-width first column whatever is left, so two different width sums put the
		* numeric columns of the two tables at different x positions — the by-account
		* table's numbers sat 48px right of the by-model table's, which is what made a
		* long account row look like it was shoving the figures sideways. Sharing one
		* vector keeps every numeric column vertically aligned down the page.
		*
		* Last entry is wider because it carries the share bar (by model) as well as a
		* plain count (by account, "rotations").
		*/
		const NUM_COL_WIDTHS = [
			"48px",
			"56px",
			"56px",
			"56px",
			"64px"
		];
		/** One right-aligned numeric header cell at column position `index`. */
		function numHeader(index, label) {
			return h("th", {
				className: "agy-num",
				style: { width: NUM_COL_WIDTHS[index] }
			}, label);
		}
		/**
		* The Token composition bar rows: cache hits, input misses, output.
		*
		* A plain-prefix cache makes the cached share dominate (it re-reads the whole
		* prefix every turn), which is correct but reads as impossible without a
		* breakdown — hence this bar, which shows the proportion rather than restating
		* the numbers.
		*
		* The three rows must stay a PARTITION of `totalTokens` (they sum to 100%), so
		* the prompt side is split rather than labelled: `kpiCacheRead` (the hit count)
		* and `kpiInputMissed` (the rest). Using `kpiInput` for a row here would
		* double-count every cached token, because the headline input figure is now the
		* WHOLE prompt side — which already contains the hits. The split is what keeps
		* the bar honest and still adds up.
		*
		* `labelKey` and `id` are SEPARATE fields on purpose. A single `key` field used
		* for both the i18n lookup and React's `key` prop is how the label position ended
		* up rendering the raw dictionary key (`kpiCacheRead`) to every user: the value
		* served React correctly, so nothing failed, and the same variable was then
		* handed to the label span. Two names make that mix-up impossible.
		*/
		function tokenComposition(counters, t) {
			const total = totalTokens(counters);
			return h("div", { className: "agy-compose" }, ...[
				{
					id: "cacheRead",
					labelKey: "kpiCacheRead",
					value: counters.cacheRead,
					tone: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6)"
				},
				{
					id: "missed",
					labelKey: "kpiInputMissedLabel",
					value: counters.input,
					tone: "var(--dsw-static-neutral-bluish-700, #8b8f96)"
				},
				{
					id: "output",
					labelKey: "kpiOutput",
					value: counters.output,
					tone: "var(--dsw-alias-state-success-primary, #22c55e)"
				}
			].map((row) => {
				const share = total > 0 ? row.value / total * 100 : 0;
				return h("div", {
					className: "agy-compose-row",
					key: row.id
				}, h("span", { className: "agy-compose-k" }, t(row.labelKey)), h("span", { className: "agy-compose-track" }, h("i", { style: {
					width: `${Math.max(share, row.value > 0 ? 1 : 0)}%`,
					background: row.tone
				} })), h("span", { className: "agy-compose-v" }, tokenText(row.value)), h("span", { className: "agy-compose-p" }, `${share.toFixed(1)}%`));
			}));
		}
		function UsageTab(props) {
			const { t } = props;
			const [range, setRange] = (0, react.useState)("today");
			const stats = props.stats;
			if (stats === null) return h("div", { className: "agy-empty" }, t("loading"));
			if (stats.all.counters.requests === 0) return card(t("usageTitle"), h("div", { className: "agy-empty" }, t("emptyUsage")));
			const view = range === "today" ? stats.today : range === "week" ? stats.week : range === "month" ? stats.month : stats.all;
			const counters = view.counters;
			const hit = cacheHitPercent(counters);
			const total = totalTokens(counters);
			return h("div", { className: "agy-root" }, h("div", { className: "agy-toolbar" }, h("div", { className: "agy-chips" }, ...RANGE_IDS.map((id) => h(_deepseek_ai_dsh_client_ui_primitives.Pill, {
				key: id,
				active: range === id,
				onClick: () => {
					setRange(id);
				}
			}, rangeLabel(id, t)))), h("span", { className: "agy-grow" }), stats.since === null ? null : h("span", { className: "agy-aside" }, t("since", { date: new Date(stats.since).toLocaleDateString() }))), card(t("usageTitle"), h("div", null, metrics([
				metric(t("kpiTotalTokens"), total, t("kpiTotalDetail", {
					requests: counters.requests,
					failed: counters.failed
				})),
				metric(t("kpiInput"), promptTokens(counters), t("kpiInputMissed", { tokens: tokenText(counters.input) })),
				metric(t("kpiCacheRead"), counters.cacheRead, hit === null ? t("kpiNoBilledInput") : t("kpiCacheHit", { percent: hit })),
				metric(t("kpiOutput"), counters.output, t("kpiOutputDetail"))
			]), tokenComposition(counters, t))), card(t("fieldLatency"), defs([
				[t("fieldCacheWrite"), tokenText(counters.cacheWrite)],
				[t("fieldRateLimitRotation"), `${counters.rateLimited} / ${counters.rotations}`],
				[t("labelLatencyAverage"), formatDuration(average(counters.latencyMs, counters.latencyN))],
				[t("labelTtft"), formatDuration(average(counters.ttftMs, counters.ttftN))]
			])), view.models.length === 0 ? null : card(t("byModel"), h("div", { className: "agy-table-wrap" }, table(h("tr", null, h("th", null, t("colModel")), numHeader(0, t("colRequests")), numHeader(1, t("kpiInput")), numHeader(2, t("kpiCacheRead")), numHeader(3, t("colOutput")), numHeader(4, t("colTokenShare"))), view.models.map((row) => h("tr", { key: row.model }, h("td", { className: "agy-strong" }, h("span", { className: "agy-mail" }, row.model)), h("td", { className: "agy-num" }, String(row.counters.requests)), h("td", { className: "agy-num" }, tokenText(promptTokens(row.counters))), h("td", { className: "agy-num" }, tokenText(row.counters.cacheRead)), h("td", { className: "agy-num" }, tokenText(row.counters.output)), h("td", { className: "agy-num" }, h("span", { className: "agy-bar" }, h("span", { className: "agy-track" }, h("i", { style: { width: `${Math.round(totalTokens(row.counters) / Math.max(1, total) * 100)}%` } }))))))))), view.accounts.length === 0 ? null : card(t("byAccount"), h("div", { className: "agy-table-wrap" }, table(h("tr", null, h("th", null, t("colAccount")), numHeader(0, t("colRequests")), numHeader(1, t("colToken")), numHeader(2, t("colFailed")), numHeader(3, t("colRateLimited")), numHeader(4, t("colRotations"))), view.accounts.map((row) => h("tr", { key: row.account }, h("td", { className: "agy-strong" }, h("span", { className: "agy-mail" }, row.account)), h("td", { className: "agy-num" }, String(row.counters.requests)), h("td", { className: "agy-num" }, tokenText(totalTokens(row.counters))), h("td", { className: "agy-num" }, String(row.counters.failed)), h("td", { className: "agy-num" }, String(row.counters.rateLimited)), h("td", { className: "agy-num" }, String(row.counters.rotations))))))));
		}
		function CredentialsTab(props) {
			const { t } = props;
			const [text, setText] = (0, react.useState)("");
			const sources = (0, react.useMemo)(() => text.split("\n").map((line) => line.trim()).filter((line) => line !== ""), [text]);
			const suffix = sources.length > 1 ? ` (${sources.length})` : "";
			return h("div", { className: "agy-root" }, subhead(t("importTitle")), hint(t("importHelp")), h("textarea", {
				className: "agy-textarea",
				style: { marginTop: "8px" },
				value: text,
				placeholder: t("importPlaceholder"),
				onChange: (event) => {
					setText(event.target.value);
				}
			}), h("div", {
				className: "agy-toolbar",
				style: { marginTop: "8px" }
			}, button(`${t("importJson")}${suffix}`, () => {
				props.onImport("json", sources);
			}, { disabled: props.busy || sources.length === 0 }), button(`${t("importBlob")}${suffix}`, () => {
				props.onImport("blob", sources);
			}, { disabled: props.busy || sources.length === 0 }), h("span", { className: "agy-grow" }), button(t("exportAll"), () => {
				props.onExportAll();
			}, { disabled: props.busy })));
		}
		/** The Settings section body. */
		function AgySettings(props) {
			const { rpc, t } = props;
			const [tab, setTab] = (0, react.useState)("accounts");
			const [accounts, setAccounts] = (0, react.useState)([]);
			const [models, setModels] = (0, react.useState)([]);
			const [modelAccount, setModelAccount] = (0, react.useState)(null);
			/** Model-discovery failure, shown on the Models tab only (see loadModels). */
			const [modelError, setModelError] = (0, react.useState)(void 0);
			/** Model ids whose own visibility write is in flight (see the toggle handler). */
			const [toggling, setToggling] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			/** Model ids whose own test call is in flight (see the per-row test button). */
			const [modelTesting, setModelTesting] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const [stats, setStats] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(void 0);
			/** A non-fatal outcome worth reporting (e.g. a partial credential import). */
			const [notice, setNoticeState] = (0, react.useState)(void 0);
			/**
			* The outcome of a one-shot action, timed like `notice`.
			*
			* A SEPARATE channel from `error` on purpose. `error` is also where a failed
			* `refresh()` lands, and "the account list could not be loaded" is a standing
			* condition: auto-dismissing it would leave a broken page looking fine 3.5s
			* later. Only an action's own verdict is transient, because the user already
			* knows what they clicked and the screen returns to a valid state either way.
			*/
			const [actionError, setActionErrorState] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(false);
			const [loaded, setLoaded] = (0, react.useState)(false);
			/** Guards state updates after the section unmounts mid-request. */
			const alive = (0, react.useRef)(true);
			/**
			* Show a transient message, then clear it.
			*
			* A message that never clears is indistinguishable from a stuck UI: the model
			* test's "X is working." stayed on screen forever, through every later action.
			* The deleted dashboard's toasts auto-dismissed after 3.5s for the same
			* reason; this keeps that behaviour, and a newer message simply replaces the
			* pending timer.
			*
			* One factory rather than two near-identical setters: the timer bookkeeping is
			* the part that must not drift between the success and failure channels. It
			* takes the timer ref as an argument rather than creating one, because a
			* `useCallback(timedChannel(...))` argument is evaluated on EVERY render — the
			* discarded function would still have appended its timer to the cancel list.
			* @param timer - the ref owning this channel's pending dismissal.
			* @param set - the state setter this channel writes to.
			* @returns a setter that arms the dismissal timer.
			*/
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
			/** Pending dismissal timers, one per channel, cancelled together on unmount. */
			const noticeTimer = (0, react.useRef)(void 0);
			const actionErrorTimer = (0, react.useRef)(void 0);
			const setNotice = (0, react.useCallback)(timedChannel(noticeTimer, setNoticeState), []);
			const setActionError = (0, react.useCallback)(timedChannel(actionErrorTimer, setActionErrorState), []);
			(0, react.useEffect)(() => () => {
				if (noticeTimer.current !== void 0) clearTimeout(noticeTimer.current);
				if (actionErrorTimer.current !== void 0) clearTimeout(actionErrorTimer.current);
			}, []);
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
				};
			}, []);
			const refresh = (0, react.useCallback)(async () => {
				const [accountOutcome, statsOutcome] = await Promise.allSettled([rpc.call("account.list", {}), rpc.call("stats.get", {})]);
				if (!alive.current) return;
				if (accountOutcome.status === "fulfilled") setAccounts(accountOutcome.value.accounts);
				if (statsOutcome.status === "fulfilled") setStats(statsOutcome.value);
				const failed = [accountOutcome, statsOutcome].find((outcome) => outcome.status === "rejected");
				if (failed?.status === "rejected") {
					const caught = failed.reason;
					setError(caught instanceof Error ? caught.message : String(caught));
				} else setError(void 0);
				if (alive.current) setLoaded(true);
			}, [rpc]);
			/**
			* Refresh the 5h/weekly windows and merge them into the account rows.
			*
			* A separate call from `account.list` because that reply is deliberately
			* probe-free — folding an upstream call into it once made the whole view wait
			* on the network. Here the rows render immediately from `account.list` and the
			* windows fill in when they arrive, so a slow probe costs a placeholder.
			*
			* It also works for a pool of ANY size: the scheduling quota refresh is skipped
			* for a single enabled account (measuring that one could block the only
			* account), so this endpoint is the only thing that fills `cachedLimits` there.
			*
			* @param force - re-probe inside the TTL. Only an EXPLICIT refresh does this;
			*   an automatic one must respect the TTL, or every action that reloads the
			*   page would spend an upstream quota call.
			* @param report - whether to surface the outcome. Set only when the user asked
			*   for the refresh, since an automatic one must stay silent.
			*/
			const loadLimits = (0, react.useCallback)(async (force = false, report = false) => {
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
							limitsUpdatedAt: entry.updatedAt
						};
					}));
					if (report) {
						if (result.failed > 0) setActionError(t("limitsRefreshFailed", { failed: result.failed }));
						else if (result.measured > 0) setNotice(t("limitsRefreshOk", { measured: result.measured }));
						else setNotice(t("limitsRefreshFresh"));
					}
				} catch (caught) {
					if (report) setActionError(caught instanceof Error ? caught.message : String(caught));
				}
			}, [
				rpc,
				setActionError,
				setNotice,
				t
			]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			(0, react.useEffect)(() => {
				if (tab === "accounts" && accounts.length > 0) loadLimits();
			}, [
				tab,
				accounts.length,
				loadLimits
			]);
			/**
			* The toolbar's Refresh: reload the page AND force the quota windows.
			*
			* The force is the whole point of a manual refresh — without it the click
			* could not deliver anything newer than what the 10-minute TTL already holds,
			* so "I want the latest numbers now" was unanswerable. The two halves are
			* deliberately not awaited together: `refresh()` is the fast local reload,
			* while the forced probe can take seconds, and the rows should not wait on it.
			*/
			const refreshAll = (0, react.useCallback)(() => {
				refresh();
				if (tab === "accounts") loadLimits(true, true);
			}, [
				loadLimits,
				refresh,
				tab
			]);
			/**
			* The model list loads separately: it is the one call that may reach upstream
			* (model discovery), so the page must render even when it is slow or fails.
			*
			* Its failure is kept out of the shared error banner. The list is loaded
			* eagerly (the tab badge needs it), and "no account configured yet" is a
			* perfectly ordinary startup state for an accounts-first page — putting that
			* in the banner would greet every new user with an error.
			*/
			const loadModels = (0, react.useCallback)(async () => {
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
			(0, react.useEffect)(() => {
				loadModels();
			}, [loadModels]);
			(0, react.useEffect)(() => {
				if (tab === "models" && models.length === 0) loadModels();
			}, [
				tab,
				models.length,
				loadModels
			]);
			/** Run one mutating call, then reload; failures land in the banner. */
			const act = (0, react.useCallback)(async (run) => {
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
			const startLogin = (0, react.useCallback)(() => {
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
			(0, react.useEffect)(() => {
				const onMessage = (event) => {
					if (event.origin !== window.location.origin) return;
					if (event.data?.type === "agy_login_success") refresh();
				};
				window.addEventListener("message", onMessage);
				return () => {
					window.removeEventListener("message", onMessage);
				};
			}, [refresh]);
			const copyText = (0, react.useCallback)(async (text) => {
				await navigator.clipboard?.writeText(text);
			}, []);
			/**
			* Run one one-shot action under the shared busy / clear / report envelope.
			*
			* Deliberately NOT `act()`. `act()` reads only a REJECTION and then calls
			* `refresh()`, which clears the banner — so a handler whose failure arrives
			* IN BAND (`{ ok: false }`, which is how `account.verify`, `account.test` and
			* `account.proxyTest` all report) had its verdict both discarded and erased:
			* the click fired, the host answered, and the panel showed nothing. The
			* reload is also not always wanted; each caller decides.
			*
			* A thrown error still lands here, so a request-level failure (a rejected
			* promise, e.g. "no proxy configured") reports through the same channel.
			* @param run - the action, which reports its own in-band verdict.
			*/
			const runAction = (0, react.useCallback)(async (run) => {
				setBusy(true);
				setNotice(void 0);
				setActionError(void 0);
				try {
					await run();
				} catch (caught) {
					if (alive.current) setActionError(caught instanceof Error ? caught.message : String(caught));
				} finally {
					if (alive.current) setBusy(false);
				}
			}, [setActionError, setNotice]);
			const handlers = (0, react.useMemo)(() => ({
				t,
				onActivate: (index) => {
					act(() => rpc.call("account.activate", { index }));
				},
				onVerify: (index) => {
					runAction(async () => {
						const result = await rpc.call("account.verify", { index });
						if (alive.current) await refresh();
						if (!alive.current) return;
						if (result.ok) setNotice(t("verifyOk", { email: result.email ?? `#${index}` }));
						else setActionError(t("verifyFail") + (result.error === void 0 ? "" : `\n${result.error}`));
					});
				},
				onDelete: (index) => {
					if (!window.confirm(t("confirmDelete"))) return;
					act(() => rpc.call("account.delete", { index }));
				},
				onTest: (index) => {
					runAction(async () => {
						const target = (models.length > 0 ? models : (await rpc.call("model.list", {})).models).find((entry) => !entry.disabled)?.id;
						if (target === void 0) throw new Error(t("noModelToTest"));
						const result = await rpc.call("account.test", {
							model: target,
							index
						});
						if (alive.current) await refresh();
						if (!alive.current) return;
						if (result.ok) setNotice(t("modelTestOk", { model: target }));
						else setActionError(t("modelTestFail", { model: target }) + (result.error === void 0 ? "" : `\n${result.error}`));
					});
				},
				onExport: (index) => {
					act(async () => {
						const result = await rpc.call("account.export", { index });
						if (result.blob === void 0) throw new Error(result.error ?? t("exportFailed"));
						await copyText(result.blob);
					});
				},
				onRegenerateFingerprint: (index) => {
					act(() => rpc.call("account.fingerprint", {
						index,
						action: "regenerate"
					}));
				},
				onSetProxy: (index, proxy) => {
					act(() => rpc.call("account.proxy", {
						index,
						proxy
					}));
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
					runAction(async () => {
						const result = await rpc.call("account.proxyTest", {
							index,
							...proxy === "" ? {} : { proxy }
						});
						if (!alive.current) return;
						if (result.ok) setNotice(t("proxyTestOk", { proxy: result.masked }));
						else setActionError(t("proxyTestFail", { proxy: result.masked }) + (result.error === void 0 ? "" : `\n${result.error}`));
					});
				}
			}), [
				act,
				copyText,
				models,
				refresh,
				rpc,
				runAction,
				setActionError,
				setNotice,
				t
			]);
			const tabButton = (id, label, count) => h("button", {
				key: id,
				type: "button",
				className: "agy-tab",
				"data-active": tab === id,
				onClick: () => {
					setTab(id);
				}
			}, label, count === void 0 ? null : h("span", { className: "agy-count" }, String(count)));
			const body = tab === "accounts" ? h(AccountsTab, {
				accounts,
				busy,
				handlers,
				t
			}) : tab === "models" ? modelError === void 0 ? h(ModelsTab, {
				models,
				account: modelAccount,
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
					(async () => {
						try {
							const result = await rpc.call("model.setDisabled", {
								modelId,
								disabled
							});
							if (!alive.current) return;
							setModels((current) => current.map((model) => model.id === result.modelId ? {
								...model,
								disabled: result.disabled
							} : model));
							setError(void 0);
						} catch (caught) {
							if (!alive.current) return;
							setError(caught instanceof Error ? caught.message : String(caught));
						} finally {
							if (alive.current) setToggling((current) => {
								const next = new Set(current);
								next.delete(modelId);
								return next;
							});
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
					(async () => {
						try {
							const result = await rpc.call("account.test", { model: modelId });
							if (!alive.current) return;
							if (result.ok) setNotice(t("modelTestOk", { model: modelId }));
							else setError(t("modelTestFail", { model: modelId }) + (result.error ? `\n${result.error}` : ""));
						} catch (caught) {
							if (!alive.current) return;
							setError(caught instanceof Error ? caught.message : String(caught));
						} finally {
							if (alive.current) setModelTesting((current) => {
								const next = new Set(current);
								next.delete(modelId);
								return next;
							});
						}
					})();
				}
			}) : h("div", { className: "agy-root" }, h("div", { className: "agy-error" }, modelError), button(t("refresh"), () => {
				loadModels();
			}, { size: "sm" })) : tab === "usage" ? h(UsageTab, {
				stats,
				t
			}) : h(CredentialsTab, {
				busy,
				t,
				onImport: (kind, sources) => {
					act(async () => {
						const result = await rpc.call("account.import", {
							kind,
							sources
						});
						if (result.errors.length > 0) setNotice(`${t("importPartial", {
							imported: result.imported,
							replaced: result.replaced,
							failed: result.errors.length
						})}\n${result.errors.join("\n")}`);
						else setNotice(t("importResult", {
							imported: result.imported,
							replaced: result.replaced
						}));
					});
				},
				onExportAll: () => {
					act(async () => {
						const { blobs } = await rpc.call("account.exportAll", {});
						await copyText(blobs.map((entry) => entry.blob).join("\n"));
					});
				}
			});
			return h("div", { className: "agy-root" }, h("div", { className: "agy-head" }, h("div", null, h("div", { className: "agy-title" }, "Antigravity"), h("div", { className: "agy-sub" }, t("subtitle"))), h("div", { className: "agy-toolbar" }, button(t("refresh"), refreshAll, {
				size: "sm",
				disabled: busy
			}), button(t("login"), startLogin, {
				size: "sm",
				disabled: busy
			}))), h("div", { className: "agy-tabs" }, tabButton("accounts", t("tabAccounts"), accounts.length), tabButton("models", t("tabModels"), models.length > 0 ? models.length : void 0), tabButton("usage", t("tabUsage")), tabButton("credentials", t("tabCredentials"))), error === void 0 ? null : h("div", { className: "agy-error" }, error), actionError === void 0 ? null : h("div", { className: "agy-error" }, actionError), notice === void 0 ? null : h("div", { className: "agy-notice" }, notice), body, loaded || error !== void 0 ? null : h("div", { className: "agy-empty" }, t("loading")));
		}
		/**
		* Register the Antigravity Settings section while this client plugin is active.
		* @param ctx - Client Cordis context.
		*/
		function apply(ctx) {
			ctx.effect(() => installAgyStyles(), "dsh-agy: styles");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-agy: dictionaries");
			const connection = ctx.get("connection");
			if (connection === void 0) {
				ctx.logger.warn("[dsh-agy] connection service unavailable — Antigravity settings not registered");
				return;
			}
			const rpc = createRpc(connection);
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "agy",
				order: 30,
				locale: NS,
				label: () => t("title")
			}, () => h(AgySettings, {
				rpc,
				t
			}))), "dsh-agy: Settings section");
		}
		//#endregion
		exports.AgySettings = AgySettings;
		exports.apply = apply;
		exports.inject = inject;
		exports.orderModels = orderModels;
		exports.tokenText = tokenText;
		return module.exports;
	}
});
