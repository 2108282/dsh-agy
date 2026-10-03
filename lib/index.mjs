import { i as isAgyDisabled } from "./accounts-CV1Hld3a.mjs";
import { t as createAgyRuntime } from "./plugin-common-DJORn8yh.mjs";
//#region src/index.ts
const name = "dsh-agy";
const inject = ["llm"];
function apply(ctx) {
	if (isAgyDisabled()) {
		ctx.logger.warn("[dsh-agy] disabled by DSH_AGY_DISABLE=1 — skipping registration");
		return;
	}
	ctx.effect(async () => {
		const { adapter } = await createAgyRuntime(ctx);
		const registration = ctx.llm.registerAdapter(["agy"], adapter);
		return () => registration();
	});
}
//#endregion
export { apply, inject, name };

//# sourceMappingURL=index.mjs.map