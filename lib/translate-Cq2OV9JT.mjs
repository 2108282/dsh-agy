import { t as __exportAll } from "./rolldown-runtime-D7D4PA-g.mjs";
import { i as generateAntigravityRequestId } from "./identity-Ci8EGc1F.mjs";
import { i as isLevelThinkingModel, n as catalogModel } from "./catalog-BgdDVJEB.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const DEFAULT_TTL_MS = 36e5;
const MAX_ENTRIES = 2e3;
const store = /* @__PURE__ */ new Map();
function pruneExpired(now = Date.now()) {
	if (store.size < MAX_ENTRIES / 2) return;
	for (const [key, entry] of store) if (entry.expiresAt <= now) store.delete(key);
}
/** Store the signature observed for one tool call id (response side). */
function setThoughtSignature(toolCallId, signature, ttlMs = DEFAULT_TTL_MS) {
	if (!toolCallId || !signature) return;
	pruneExpired();
	if (store.size >= MAX_ENTRIES) {
		let oldestKey = null;
		let oldestExpiry = Infinity;
		for (const [key, entry] of store) if (entry.expiresAt < oldestExpiry) {
			oldestExpiry = entry.expiresAt;
			oldestKey = key;
		}
		if (oldestKey) store.delete(oldestKey);
	}
	store.set(toolCallId, {
		signature,
		expiresAt: Date.now() + ttlMs
	});
}
/** Resolve the signature for one tool call id, or null when unknown/expired. */
function getThoughtSignature(toolCallId) {
	if (!toolCallId) return null;
	const entry = store.get(toolCallId);
	if (!entry) return null;
	if (entry.expiresAt <= Date.now()) {
		store.delete(toolCallId);
		return null;
	}
	return entry.signature;
}
//#endregion
//#region src/adapter/multimodal.ts
/**
* Multimodal file resolution for Google Gemini on Antigravity.
*
* In DeepSeek Harness (DSH), non-image files (PDF, audio, video, etc.)
* uploaded by users are converted by DSH's LLM runtime into deterministic
* text handles:
*
* `[File "${name}" (${bytes} bytes, sha256:${digest}): verbatim read-only copy saved at "${readonlyPath}". ...]`
*
* Gemini models natively support these files as base64-encoded `inlineData`
* parts alongside text. Claude models running behind the Antigravity Vertex
* proxy reject non-image `inlineData` with 500, so injection is scoped strictly
* to Gemini (non-Claude, vision-capable) models.
*/
/**
* MIME type mapping for Gemini supported multimodal formats.
*
* Covered formats (PDF observed live end-to-end; the rest follow Gemini's
* documented multimodal support and are not yet live-verified):
* - Document: .pdf -> 'application/pdf'
* - Audio: .mp3 -> 'audio/mp3', .wav -> 'audio/wav', .m4a -> 'audio/m4a', .aac -> 'audio/aac', .ogg -> 'audio/ogg', .flac -> 'audio/flac'
* - Video: .mp4 -> 'video/mp4', .mov -> 'video/quicktime', .webm -> 'video/webm'
* - Extended image: .bmp -> 'image/bmp', .heic -> 'image/heic', .heif -> 'image/heif'
*/
const GEMINI_MULTIMODAL_MIMES = Object.freeze({
	pdf: "application/pdf",
	mp3: "audio/mp3",
	wav: "audio/wav",
	m4a: "audio/m4a",
	aac: "audio/aac",
	ogg: "audio/ogg",
	flac: "audio/flac",
	mp4: "video/mp4",
	mov: "video/quicktime",
	webm: "video/webm",
	bmp: "image/bmp",
	heic: "image/heic",
	heif: "image/heif",
	".pdf": "application/pdf",
	".mp3": "audio/mp3",
	".wav": "audio/wav",
	".m4a": "audio/m4a",
	".aac": "audio/aac",
	".ogg": "audio/ogg",
	".flac": "audio/flac",
	".mp4": "video/mp4",
	".mov": "video/quicktime",
	".webm": "video/webm",
	".bmp": "image/bmp",
	".heic": "image/heic",
	".heif": "image/heif"
});
/**
* Regex matching DSH's deterministic read-only file handle blocks.
* Capture groups:
* 1: file name
* 2: file size in bytes
* 3: local read-only filesystem path
*/
const DSH_FILE_HANDLE_REGEX = /\[File "([^"]+)" \((\d+) bytes, sha256:[a-f0-9]+\): verbatim read-only copy saved at "([^"]+)"\./g;
/** Extract file handle descriptors from text content. */
function extractFileHandles(text) {
	const regex = new RegExp(DSH_FILE_HANDLE_REGEX.source, "g");
	const results = [];
	for (const match of text.matchAll(regex)) {
		const [, name, bytesStr, readonlyPath] = match;
		if (name && bytesStr && readonlyPath) {
			const bytes = parseInt(bytesStr, 10);
			if (!Number.isNaN(bytes)) results.push({
				name,
				bytes,
				readonlyPath
			});
		}
	}
	return results;
}
/** Resolve MIME type for a file name or path based on extension. */
function getMultimodalMimeType(filenameOrPath) {
	const dotIndex = filenameOrPath.lastIndexOf(".");
	if (dotIndex === -1) return void 0;
	const ext = filenameOrPath.slice(dotIndex + 1).toLowerCase();
	return GEMINI_MULTIMODAL_MIMES[ext];
}
/** Whether a model id belongs to a Claude-branded model (Vertex-hosted). */
function isClaudeModel(model) {
	return model.startsWith("claude-") || model.includes("/claude");
}
/**
* Check whether a model supports Gemini multimodal file inlineData.
* Deny-by-default: Claude models are always excluded (Vertex 500 on
* non-image inlineData), catalog models must be vision-capable, and ids
* unknown to the catalog are only allowed when they carry the `gemini-`
* prefix (so future tiered ids keep working without a catalog bump).
*/
function supportsMultimodalFiles(model) {
	if (isClaudeModel(model)) return false;
	const meta = catalogModel(model);
	if (meta) return meta.supportsVision === true;
	return model.startsWith("gemini-");
}
/**
* Resolve multimodal files referenced in user messages.
*
* Reads local files up to 20MB into base64 strings. Silently ignores
* missing/unreadable files or files exceeding the size limit so the original
* text handle block remains intact in the prompt.
*/
async function resolveMultimodalFiles(optionsOrMessages, modelOrOptions, extraOptions) {
	let messages;
	let model;
	let customOptions;
	if ("messages" in optionsOrMessages) {
		messages = optionsOrMessages.messages ?? [];
		model = optionsOrMessages.model ?? "";
		customOptions = typeof modelOrOptions === "object" ? modelOrOptions : extraOptions;
	} else {
		messages = optionsOrMessages;
		if (typeof modelOrOptions === "string") {
			model = modelOrOptions;
			customOptions = extraOptions;
		} else {
			model = "";
			customOptions = modelOrOptions;
		}
	}
	const result = /* @__PURE__ */ new Map();
	if (!supportsMultimodalFiles(model)) return result;
	const readFn = customOptions?.readFile ?? readFile;
	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];
		if (!message || message.role !== "user") continue;
		const resolvedForMessage = [];
		for (const block of message.content) {
			if (block.type !== "text" || typeof block.text !== "string") continue;
			const handles = extractFileHandles(block.text);
			for (const handle of handles) {
				if (handle.bytes > 20971520) continue;
				const mimeType = getMultimodalMimeType(handle.name) ?? getMultimodalMimeType(handle.readonlyPath);
				if (!mimeType) continue;
				try {
					const fileBuffer = await readFn(handle.readonlyPath);
					if (fileBuffer.length > 20971520) continue;
					resolvedForMessage.push({
						mimeType,
						data: Buffer.from(fileBuffer).toString("base64"),
						name: handle.name,
						path: handle.readonlyPath,
						bytes: fileBuffer.length
					});
				} catch {
					continue;
				}
			}
		}
		if (resolvedForMessage.length > 0) {
			const key = message.id ?? `msg-${i}`;
			result.set(key, resolvedForMessage);
		}
	}
	return result;
}
//#endregion
//#region src/adapter/translate.ts
/**
* Translate a DSH GenerateOptions into the Antigravity wrapped request.
*
* Envelope shape follows the actively-maintained OmniRoute wire format
* (the archived opencode reference predates it): top-level `project`,
* `requestId`, `model`, `userAgent`, `requestType`, with the Gemini-style
* body under `request` (contents/systemInstruction/tools/generationConfig/
* sessionId). `toolConfig` VALIDATED is attached when tools are present, and
* Claude-path requests strip trailing model turns (Vertex rejects "assistant
* message prefill").
*
* Thinking blocks are carried as-is on the Gemini path (Gemini `thought`
* parts); no thought is ever re-signed — that signature dance was an artifact
* of the reference plugin's interception architecture (see
* docs/ARCHITECTURE.md). The Claude path is stricter and drops thought parts
* entirely, because its validator demands a real thinking signature that only
* the originating model can produce (docs/ANTIGRAVITY-API.md §3.3).
*/
var translate_exports = /* @__PURE__ */ __exportAll({
	AGY_BEHAVIOR_INSTRUCTION: () => AGY_BEHAVIOR_INSTRUCTION,
	AGY_CLAUDE_MAX_OUTPUT_TOKENS: () => AGY_CLAUDE_MAX_OUTPUT_TOKENS,
	AGY_SCHEMA_ALLOWLIST: () => AGY_SCHEMA_ALLOWLIST,
	isClaudeModel: () => isClaudeModel,
	stripTrailingModelTurn: () => stripTrailingModelTurn,
	supportsMultimodalFiles: () => supportsMultimodalFiles,
	toAgyRequestBody: () => toAgyRequestBody
});
/**
* Vertex (the Antigravity Claude backend) rejects conversations ending on an
* assistant/model turn ("assistant message prefill"); never strip to empty.
*/
function stripTrailingModelTurn(contents) {
	while (contents.length > 1 && contents[contents.length - 1]?.role === "model") contents.pop();
	return contents;
}
/**
* The Antigravity backend parses tool `parameters` as a strict protobuf
* schema and rejects ANY unknown keyword with 400 (verified empirically:
* `$schema`, `propertyNames`, `pattern`, `minLength`, ... each fail in turn).
* Denylisting is whack-a-mole, so keep only the keywords the upstream
* accepts. Container shapes are handled distinctly: `properties` is a
* name->schema map (keys preserved), `items`/`additionalProperties` are
* nested schemas (additionalProperties also accepts a boolean — live-verified
* against the Antigravity upstream), `required`/`enum` are plain arrays.
*
* Keyword VALUES are also constrained by the protobuf shape (verified
* empirically): `type` must be a single enum string (union arrays like
* `["string","number"]` are rejected) and every `enum` item must be a
* string (booleans/numbers are rejected). Values are normalized to the
* nearest valid form instead of being dropped wholesale.
*/
const AGY_SCHEMA_ALLOWLIST = /* @__PURE__ */ new Set([
	"type",
	"format",
	"title",
	"description",
	"nullable",
	"items",
	"enum",
	"default",
	"properties",
	"required",
	"additionalProperties"
]);
const AGY_SCHEMA_MAP_KEYS = /* @__PURE__ */ new Set(["properties"]);
const AGY_SCHEMA_NESTED_KEYS = /* @__PURE__ */ new Set(["items", "additionalProperties"]);
const AGY_SCHEMA_LIST_KEYS = /* @__PURE__ */ new Set(["required", "enum"]);
function sanitizeToolSchema(schema) {
	if (!schema || typeof schema !== "object") return schema;
	if (Array.isArray(schema)) return schema.map((entry) => sanitizeToolSchema(entry));
	let normalized = schema;
	if (Array.isArray(normalized.type)) {
		const types = normalized.type.filter((t) => typeof t === "string" && t !== "null");
		normalized = {
			...normalized,
			type: types[0] ?? "string"
		};
	}
	const result = {};
	for (const [key, value] of Object.entries(normalized)) {
		if (!AGY_SCHEMA_ALLOWLIST.has(key)) continue;
		if (AGY_SCHEMA_MAP_KEYS.has(key)) {
			const map = {};
			for (const [name, child] of Object.entries(value)) map[name] = sanitizeToolSchema(child);
			result[key] = map;
			continue;
		}
		if (AGY_SCHEMA_NESTED_KEYS.has(key)) {
			result[key] = sanitizeToolSchema(value);
			continue;
		}
		if (AGY_SCHEMA_LIST_KEYS.has(key)) {
			if (key === "enum" && Array.isArray(value)) {
				const filtered = value.filter((v) => typeof v === "string");
				if (filtered.length > 0) result[key] = filtered;
			} else result[key] = value;
			continue;
		}
		result[key] = value;
	}
	return result;
}
/** Collect tool-call names by id so tool-result blocks can name their function. */
function buildToolNameIndex(messages) {
	const index = /* @__PURE__ */ new Map();
	for (const message of messages) for (const block of message.content) if (block.type === "tool-call") index.set(block.id, block.name);
	return index;
}
function blockToParts(block, toolNames, images, dropThoughts = false) {
	switch (block.type) {
		case "text": return block.text === "" ? [] : [{ text: block.text }];
		case "reasoning":
			if (block.text === "") return [];
			if (dropThoughts) return [];
			return [{
				thought: true,
				text: block.text
			}];
		case "tool-call": {
			let args = {};
			if (typeof block.arguments === "object" && block.arguments !== null && !Array.isArray(block.arguments)) args = block.arguments;
			else if (typeof block.arguments === "string") try {
				const parsed = JSON.parse(block.arguments);
				if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) args = parsed;
			} catch {}
			return [{
				thoughtSignature: getThoughtSignature(block.id) ?? "skip_thought_signature_validator",
				functionCall: {
					id: block.id,
					name: block.name,
					args
				}
			}];
		}
		case "tool-result": {
			const name = toolNames.get(block.toolCallId) ?? block.toolCallId;
			const text = block.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
			return [{ functionResponse: {
				id: block.toolCallId,
				name,
				response: {
					result: text,
					is_error: block.isError === true
				}
			} }];
		}
		case "image": {
			const resolved = images.get(block.attachment.attachmentId);
			if (!resolved) throw new Error(`agy translate: unresolved image attachment "${block.attachment.attachmentId}"`);
			return [{ inlineData: {
				mimeType: resolved.mediaType,
				data: resolved.data
			} }];
		}
		default: return [];
	}
}
function messageToContent(message, toolNames, images, multimodalFiles, messageIndex, dropThoughts = false) {
	const parts = message.content.flatMap((block) => block.type === "image" && message.role !== "user" ? [] : blockToParts(block, toolNames, images, dropThoughts));
	if (message.role === "user" && multimodalFiles) {
		const files = (message.id ? multimodalFiles.get(message.id) : void 0) ?? multimodalFiles.get(message) ?? (messageIndex !== void 0 ? multimodalFiles.get(`msg-${messageIndex}`) : void 0) ?? (messageIndex !== void 0 ? multimodalFiles.get(String(messageIndex)) : void 0);
		if (files) for (const file of files) parts.push({ inlineData: {
			mimeType: file.mimeType,
			data: file.data
		} });
	}
	if (parts.length === 0) return null;
	return {
		role: message.role === "assistant" ? "model" : "user",
		parts
	};
}
/**
* Builtin Gemini tools must not shadow functionDeclarations names (upstream
* treats them as native tools; verified by OmniRoute's GEMINI_BUILTIN_TOOL_NAMES).
*/
const AGY_BUILTIN_TOOL_NAMES = /* @__PURE__ */ new Set([
	"google_search",
	"web_search",
	"search_web",
	"googleSearch"
]);
const AGY_BEHAVIOR_INSTRUCTION = `【Antigravity 协作交互规范】
1. 思考与推理（Thinking）：你的思考过程（thought / reasoning）必须与用户使用的语言保持一致（默认使用中文），请一律使用中文进行深度思考和问题拆解。
2. 边对话边执行（Crucial）：在执行任何工具操作（如 bash、edit、write 等）之前，必须先用简短自然的一两句话（中文）向用户说明你正在排查什么、发现的问题或接下来计划执行的操作，然后再调用工具。切勿在没有向用户说明的情况下默默连续调用工具！实现一边与用户对话沟通、一边高效推进任务的协作体验。
3. 持续思考：在收到工具执行结果后，若需要进一步分析或多步排查，请继续进行思考并向用户简述发现，再调用下一个工具。
4. 对话语言：与用户的所有对话交互一律使用中文。`;
/** Level-thinking: single id + selectable low/medium/high via thinkingLevel (catalog thinking:'level'). */
const LEVEL_THINKING_LEVELS = /* @__PURE__ */ new Set([
	"low",
	"medium",
	"high"
]);
/**
* Claude-family output ceiling on the Antigravity channel (live-measured).
*
* The Claude models are served through the Gemini-style
* `generationConfig.maxOutputTokens` field here, and this channel rejects the
* Claude family above 64000: 64000 answers 200, 64001 answers 400
* `INVALID_ARGUMENT: Request contains an invalid argument` (deterministic
* across both Claude ids, with and without the full 87-tool payload). The
* Gemini family accepts 65536 on the same endpoint, so the limit is
* model-family-specific, not endpoint-wide.
*
* Do NOT reason about this number from Anthropic's public API limits. Agy may
* front a self-hosted or otherwise gated Claude deployment whose capacity and
* validation rules are its own; the only authority is what this channel
* accepts, which is what the probe measures. The value here is that
* measurement, nothing more.
*
* The catalog's `maxOutputTokens` is the harness-injected default
* (`LlmResolvedModelInfo.defaultMaxTokens`), so a wrong value there makes every
* Claude request fail. This clamp is the second line of defense: it also covers
* an explicit `maxTokens` (agent preset / call config) and a dynamically
* discovered Claude id absent from the pinned catalog.
*/
const AGY_CLAUDE_MAX_OUTPUT_TOKENS = 64e3;
/** Upstream functionDeclarations names are `[a-zA-Z0-9_]` and ≤64 chars (OmniRoute-verified). */
const AGY_TOOL_NAME_MAX_LENGTH = 64;
/** Sanitize a tool name to the upstream charset/length; dedupe via a short hash. */
function sanitizeToolName(name, seen) {
	let candidate = name.replace(/[^a-zA-Z0-9_]/g, "_") || "tool";
	if (candidate.length > AGY_TOOL_NAME_MAX_LENGTH || seen.has(candidate)) {
		const hash = createHash("sha256").update(candidate).digest("hex").slice(0, 8);
		const prefix = candidate.slice(0, AGY_TOOL_NAME_MAX_LENGTH - hash.length - 1);
		candidate = `${prefix}_${hash}`;
		let i = 2;
		while (seen.has(candidate)) candidate = `${prefix}_${i++}_${hash}`;
	}
	seen.add(candidate);
	return candidate;
}
function toolsToDeclarations(tools) {
	if (!tools || tools.length === 0) return void 0;
	const seenNames = /* @__PURE__ */ new Set();
	const declarations = [];
	for (const tool of tools) {
		if (AGY_BUILTIN_TOOL_NAMES.has(tool.name)) continue;
		declarations.push({
			name: sanitizeToolName(tool.name, seenNames),
			description: tool.description,
			parameters: sanitizeToolSchema(tool.parameters)
		});
	}
	if (declarations.length === 0) return void 0;
	return [{ functionDeclarations: declarations }];
}
/** Build the wrapped Antigravity request body for one call. */
function toAgyRequestBody(options, context) {
	const toolNames = buildToolNameIndex(options.messages);
	const images = context.images ?? /* @__PURE__ */ new Map();
	const multimodalFiles = supportsMultimodalFiles(options.model) ? context.multimodalFiles : void 0;
	const claude = isClaudeModel(options.model);
	let contents = options.messages.map((message, index) => messageToContent(message, toolNames, images, multimodalFiles, index, claude)).filter((c) => c !== null);
	if (claude) contents = stripTrailingModelTurn(contents);
	let systemText = options.system;
	if (context.appendBehaviorInstruction) systemText = systemText ? `${systemText}\n\n${AGY_BEHAVIOR_INSTRUCTION}` : AGY_BEHAVIOR_INSTRUCTION;
	const tools = toolsToDeclarations(options.tools);
	const generationConfig = {};
	if (options.temperature !== void 0) generationConfig.temperature = options.temperature;
	if (options.maxTokens !== void 0) generationConfig.maxOutputTokens = isClaudeModel(options.model) ? Math.min(options.maxTokens, AGY_CLAUDE_MAX_OUTPUT_TOKENS) : options.maxTokens;
	if (options.stop !== void 0 && options.stop.length > 0) generationConfig.stopSequences = options.stop;
	const effort = options.reasoningEffort?.toLowerCase();
	if (isLevelThinkingModel(options.model)) {
		if (options.purpose === "session-title" || effort === "none" || effort === "off") generationConfig.thinkingConfig = { thinkingBudget: 0 };
		else if (effort === void 0) {
			const tiered = context.tieredBudgetFor?.();
			if (tiered !== void 0) generationConfig.thinkingConfig = {
				thinkingBudget: tiered,
				includeThoughts: true
			};
		} else if (LEVEL_THINKING_LEVELS.has(effort)) {
			const configured = context.thinkingBudgetFor?.(effort);
			generationConfig.thinkingConfig = configured === void 0 ? {
				thinkingLevel: effort,
				includeThoughts: true
			} : {
				thinkingBudget: configured,
				includeThoughts: true
			};
		}
	} else if (claude && options.purpose !== "session-title") {
		const claudeBudget = context.claudeBudgetFor?.();
		const outputCap = generationConfig.maxOutputTokens;
		if (claudeBudget !== void 0 && outputCap !== void 0 && outputCap > claudeBudget) generationConfig.thinkingConfig = {
			thinkingBudget: claudeBudget,
			includeThoughts: true
		};
	}
	return {
		project: context.projectId || void 0,
		requestId: context.requestId ?? generateAntigravityRequestId(),
		model: options.model,
		userAgent: "antigravity",
		requestType: "agent",
		request: {
			contents,
			...systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {},
			...tools ? { tools } : {},
			...tools ? { toolConfig: { functionCallingConfig: { mode: "VALIDATED" } } } : {},
			...Object.keys(generationConfig).length > 0 ? { generationConfig } : {},
			...context.sessionId ? { sessionId: context.sessionId } : {}
		}
	};
}
//#endregion
export { setThoughtSignature as i, translate_exports as n, resolveMultimodalFiles as r, toAgyRequestBody as t };

//# sourceMappingURL=translate-Cq2OV9JT.mjs.map