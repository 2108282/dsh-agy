import { randomBytes } from "node:crypto";
//#region src/runtime/identity.ts
/**
* Antigravity request/session identity generation (mirrors the active
* OmniRoute implementation; the archived reference stopped maintaining these).
*/
/** One request id per upstream call: `agent/<epoch>/<8 hex>`. */
function generateAntigravityRequestId() {
	return `agent/${Date.now()}/${randomBytes(4).toString("hex")}`;
}
const FNV_OFFSET_I64 = -3750763044362895579n;
const FNV_PRIME_I64 = 1099511628211n;
/** 64-bit FNV-1a hash of a string (stable across processes). */
function fnv1a64(input) {
	let hash = FNV_OFFSET_I64;
	for (let i = 0; i < input.length; i++) {
		hash ^= BigInt(input.charCodeAt(i));
		hash = BigInt.asIntN(64, hash * FNV_PRIME_I64);
	}
	return hash;
}
/**
* Stable per-account session id: same account always derives the same id, so
* multi-turn context caching keys consistently; unknown accounts get a fresh
* random id.
*/
function deriveAntigravitySessionId(accountKey) {
	if (!accountKey || accountKey.trim().length === 0) return null;
	const hash = fnv1a64(accountKey.trim());
	return `-${((hash < 0n ? -hash : hash) % 9000000000000000000n).toString()}`;
}
//#endregion
export { generateAntigravityRequestId as n, deriveAntigravitySessionId as t };

//# sourceMappingURL=identity-DsftHTJC.mjs.map