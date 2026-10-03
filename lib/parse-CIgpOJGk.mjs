import { t as __exportAll } from "./rolldown-runtime-D7D4PA-g.mjs";
import * as DshLlm from "@deepseek-ai/dsh-llm";
//#region src/adapter/parse.ts
var parse_exports = /* @__PURE__ */ __exportAll({
	UnmappedFinishReasonError: () => UnmappedFinishReasonError,
	parseAgySse: () => parseAgySse,
	parseSseDataLine: () => parseSseDataLine
});
const CallId = DshLlm.ToolCallId ?? DshLlm.CallId;
if (!CallId) throw new Error("dsh-llm: neither ToolCallId nor CallId found");
/**
* Parse one SSE `data:` line; returns null for `[DONE]` or empty lines.
* Accepts the `{"response": {...}}` envelope (daily endpoint wire shape) and
* the bare array/object shapes older clients emitted.
*/
function parseSseDataLine(line) {
	const trimmed = line.trim();
	if (!trimmed.startsWith("data:")) return null;
	const data = trimmed.slice(5).trim();
	if (data === "" || data === "[DONE]") return null;
	const parsed = JSON.parse(data);
	const root = parsed?.response ?? parsed;
	return (Array.isArray(root) ? root[0] : root) ?? null;
}
/**
* Extract an error body from a line that does not carry the SSE `data:`
* prefix. The upstream occasionally drops its `{"error":{...}}` vocabulary as
* a bare JSON line right before terminating the stream — the socket closes
* cleanly and nothing else surfaces the failure. Returns null for anything
* that is not a JSON object carrying an `error` object; SSE comments and
* event/id/retry fields stay skipped.
*/
function extractBareJsonError(line) {
	const trimmed = line.trim();
	if (!trimmed.startsWith("{")) return null;
	try {
		const parsed = JSON.parse(trimmed);
		if (parsed.error && typeof parsed.error === "object") return parsed.error;
	} catch {}
	return null;
}
/**
* Thrown when the upstream ends a stream with a `finishReason` this parser
* does not map (SAFETY, RECITATION, MALFORMED_FUNCTION_CALL, ...). A silent
* default to `stop` presented policy-blocked and malformed-call turns as
* completed. This is a CONTENT-level verdict, not account health: the adapter
* reports it as `request-error` (no cooldown, no rotation), never
* `network-error`.
*/
var UnmappedFinishReasonError = class extends Error {
	reason;
	constructor(reason) {
		super(`agy upstream ended the stream with unrecognized finishReason: ${reason}`);
		this.reason = reason;
		this.name = "UnmappedFinishReasonError";
	}
};
/**
* Map the upstream `finishReason` vocabulary onto DSH's. WHITELIST, not
* blacklist: the completable reasons map to their kinds and every other
* explicit reason throws. `FINISH_REASON_UNSPECIFIED` is granted `stop` — it
* carries no information, exactly like the absent field.
*/
function mapFinishReason(reason) {
	switch (reason) {
		case "MAX_TOKENS": return { kind: "max-tokens" };
		case "STOP":
		case "FINISH_REASON_UNSPECIFIED": return { kind: "stop" };
		case "TOOL_CALLS":
		case "FUNCTION_CALL": return { kind: "tool-calls" };
		default: throw new UnmappedFinishReasonError(reason);
	}
}
async function* parseAgySse(body, options = {}) {
	const { signal } = options;
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let blockIndex = 0;
	let finishReason = { kind: "stop" };
	let sawDone = false;
	let sawFinishReason = false;
	let sawUsage = false;
	let lastUsage = null;
	let open = null;
	const closeBlock = () => {
		if (!open) return null;
		const block = open.kind === "tool-call" ? {
			type: "block-end",
			index: blockIndex,
			block: {
				type: "tool-call",
				id: CallId(open.id ?? `call-${blockIndex}`),
				name: open.name ?? "",
				arguments: open.arguments
			}
		} : {
			type: "block-end",
			index: blockIndex,
			block: {
				type: open.kind,
				text: open.text
			}
		};
		open = null;
		blockIndex += 1;
		return block;
	};
	/**
	* Ensure a block of the given kind is open, switching when needed.
	* Returns chunks to yield (a closed block's end, then the new block's start).
	* Callers MUST yield everything returned — dropping the end silently corrupts
	* the block stream for DSH (verified: multi-tool turns and text→tool
	* transitions lost their block-end).
	*/
	const ensureBlock = (kind, meta = {}) => {
		const out = [];
		if (open && open.kind !== kind) {
			const end = closeBlock();
			if (end) out.push(end);
		}
		if (!open) {
			open = {
				kind,
				arguments: "",
				text: "",
				id: meta.id,
				name: meta.name
			};
			const blockType = kind === "tool-call" ? "tool-call" : kind;
			out.push({
				type: "block-start",
				index: blockIndex,
				blockType
			});
		}
		return out;
	};
	/**
	* Handle one wire line and return the chunks to yield. Shared by the read
	* loop and the EOF residual so a final line without a trailing newline is
	* processed exactly like a newline-terminated one — dropping it would lose
	* content AND, since the completeness guard landed, falsify a premature
	* termination on streams that end bare.
	*/
	const handleLine = (line) => {
		const out = [];
		const trimmed = line.trim();
		if (!trimmed.startsWith("data:")) {
			const bare = extractBareJsonError(trimmed);
			if (bare) {
				const message = bare.message ?? bare.status ?? "upstream error";
				throw new Error(`agy stream error (${bare.code ?? "unknown"}): ${message}`);
			}
			return out;
		}
		if (trimmed.slice(5).trim() === "[DONE]") {
			sawDone = true;
			return out;
		}
		const payload = parseSseDataLine(trimmed);
		if (!payload) return out;
		if (payload.error) {
			const message = payload.error.message ?? payload.error.status ?? "upstream error";
			throw new Error(`agy stream error (${payload.error.code ?? "unknown"}): ${message}`);
		}
		for (const candidate of payload.candidates ?? []) {
			if (candidate.finishReason) {
				sawFinishReason = true;
				finishReason = mapFinishReason(candidate.finishReason);
			}
			for (const part of candidate.content?.parts ?? []) if (part.text !== void 0 && part.thought !== true) {
				out.push(...ensureBlock("text"));
				open.text += part.text;
				out.push({
					type: "text-delta",
					index: blockIndex,
					text: part.text
				});
			} else if (part.text !== void 0 && part.thought === true) {
				out.push(...ensureBlock("reasoning"));
				open.text += part.text;
				out.push({
					type: "reasoning-delta",
					index: blockIndex,
					text: part.text
				});
			} else if (part.functionCall) {
				const upstreamId = part.functionCall.id || String(blockIndex);
				if (open) {
					const end = closeBlock();
					if (end) out.push(end);
				}
				const start = ensureBlock("tool-call", {
					id: upstreamId,
					name: part.functionCall.name
				});
				out.push(...start);
				if (part.thoughtSignature) options.onToolSignature?.(upstreamId, part.thoughtSignature);
				const argsJson = typeof part.functionCall.args === "string" ? part.functionCall.args : JSON.stringify(part.functionCall.args ?? {});
				open.arguments += argsJson;
				out.push({
					type: "tool-call-delta",
					index: blockIndex,
					id: CallId(open.id ?? ""),
					name: open.name,
					argumentsDelta: argsJson
				});
			}
		}
		if (payload.usageMetadata) {
			sawUsage = true;
			const promptTokens = payload.usageMetadata.promptTokenCount ?? 0;
			const cachedTokens = payload.usageMetadata.cachedContentTokenCount ?? 0;
			lastUsage = {
				inputTokens: Math.max(0, promptTokens - cachedTokens),
				outputTokens: payload.usageMetadata.candidatesTokenCount ?? 0,
				cacheReadTokens: cachedTokens
			};
		}
		return out;
	};
	try {
		while (true) {
			if (signal?.aborted) throw new DOMException("aborted", "AbortError");
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let newlineIndex;
			while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
				const line = buffer.slice(0, newlineIndex);
				buffer = buffer.slice(newlineIndex + 1);
				for (const chunk of handleLine(line)) yield chunk;
			}
		}
		buffer += decoder.decode();
		if (buffer.trim() !== "") {
			const line = buffer;
			buffer = "";
			for (const chunk of handleLine(line)) yield chunk;
		}
		if (!sawDone && !sawFinishReason) throw new Error("agy stream terminated prematurely without [DONE] or finishReason");
		const closed = closeBlock();
		if (closed) yield closed;
		if (lastUsage) yield {
			type: "usage",
			usage: lastUsage
		};
		else if (sawUsage) yield {
			type: "usage",
			usage: {
				inputTokens: 0,
				outputTokens: 0
			}
		};
		yield {
			type: "finish",
			reason: finishReason
		};
	} finally {
		reader.releaseLock();
	}
}
//#endregion
export { parseAgySse as n, parse_exports as r, UnmappedFinishReasonError as t };

//# sourceMappingURL=parse-CIgpOJGk.mjs.map