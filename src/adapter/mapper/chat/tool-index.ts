import type { ResponsesContext } from "../../../context/responses-context";
import type {
	ApplyPatchOperation,
	CustomToolCall,
	FunctionCall,
	LocalShellCall,
	ResponseItem,
	ResponseTool,
	ShellCall,
	ToolSearchCall,
} from "../../../protocol/openai/responses";
import { isRecord, isStringArray } from "../../utils";

export type ToolIdentity =
	| { type: "function"; providerName: string; name: string }
	| { type: "local_shell"; providerName: string }
	| { type: "shell"; providerName: string }
	| { type: "apply_patch"; providerName: string }
	| {
			type: "tool_search";
			providerName: string;
			execution?: "server" | "client";
	  }
	| { type: "custom"; providerName: string; name: string }
	| {
			type: "namespace_function";
			providerName: string;
			namespace: string;
			name: string;
	  }
	| {
			type: "namespace_custom";
			providerName: string;
			namespace: string;
			name: string;
	  };

export type ProviderToolIndexSidecars = Readonly<Record<string, unknown>>;

export interface FlattenedToolNameMatch {
	namespace: string;
	name: string;
}

export function flattenToolName(tool: {
	namespace?: string;
	name: string;
}): string {
	return tool.namespace ? `${tool.namespace}__${tool.name}` : tool.name;
}

export class ToolIdentityCatalog {
	static empty(): ToolIdentityCatalog {
		return new ToolIdentityCatalog(new Map());
	}

	static fromTools(
		tools: ResponseTool[] | undefined,
		encodeName: (name: string) => string = (name) => name,
	): ToolIdentityCatalog {
		const builder = new ToolIdentityCatalogBuilder(encodeName);
		for (const tool of tools ?? []) {
			const type = tool.type;
			switch (type) {
				case "function":
					builder.addFunction(tool.name);
					break;
				case "local_shell":
				case "shell":
				case "apply_patch":
					builder.addBuiltin(type);
					break;
				case "tool_search":
					builder.addToolSearch(tool.execution);
					break;
				case "custom":
					builder.addCustom(tool.name);
					break;
				case "namespace":
					for (const nestedTool of tool.tools) {
						builder.addNamespaceTool(
							tool.name,
							nestedTool.name,
							nestedTool.type,
						);
					}
					break;
			}
		}
		return builder.build();
	}

	private readonly byProviderName: ReadonlyMap<string, ToolIdentity>;

	constructor(byProviderName: ReadonlyMap<string, ToolIdentity>) {
		this.byProviderName = new Map(byProviderName);
	}

	resolve(providerName: string): ToolIdentity | null {
		return this.byProviderName.get(providerName) ?? null;
	}

	resolveFlattenedNamespaceTool(
		providerName: string,
	): FlattenedToolNameMatch | null {
		const identity = this.resolve(providerName);
		if (
			identity?.type === "namespace_function" ||
			identity?.type === "namespace_custom"
		) {
			return { namespace: identity.namespace, name: identity.name };
		}
		return null;
	}
}

export class ToolIdentityCatalogBuilder {
	readonly #byProviderName = new Map<string, ToolIdentity>();
	readonly #namespaceProviderNames = new Set<string>();

	constructor(
		private readonly encodeName: (name: string) => string = (name) => name,
	) {}

	addFunction(name: string): void {
		const providerName = this.encodeName(name);
		setIfAbsent(this.#byProviderName, providerName, {
			type: "function",
			providerName,
			name,
		});
	}

	addBuiltin(type: "local_shell" | "shell" | "apply_patch"): void {
		const providerName = this.encodeName(type);
		setIfAbsent(this.#byProviderName, providerName, {
			type,
			providerName,
		});
	}

	addToolSearch(execution?: "server" | "client"): void {
		const providerName = this.encodeName("tool_search");
		setIfAbsent(this.#byProviderName, providerName, {
			type: "tool_search",
			providerName,
			execution,
		});
	}

	addCustom(name: string): void {
		const providerName = this.encodeName(name);
		setIfAbsent(this.#byProviderName, providerName, {
			type: "custom",
			providerName,
			name,
		});
	}

	addNamespaceTool(
		namespace: string,
		name: string,
		type: "function" | "custom",
	): void {
		const providerName = this.encodeName(flattenToolName({ namespace, name }));
		if (this.#namespaceProviderNames.has(providerName)) return;
		this.#namespaceProviderNames.add(providerName);
		this.#byProviderName.set(
			providerName,
			type === "custom"
				? {
						type: "namespace_custom",
						providerName,
						namespace,
						name,
					}
				: {
						type: "namespace_function",
						providerName,
						namespace,
						name,
					},
		);
	}

	build(): ToolIdentityCatalog {
		return new ToolIdentityCatalog(this.#byProviderName);
	}
}

export class ProviderToolIndex<
	TDeclarations extends readonly unknown[] = readonly unknown[],
	TSidecars extends ProviderToolIndexSidecars = ProviderToolIndexSidecars,
> {
	static empty<
		TDeclarations extends readonly unknown[] = readonly unknown[],
		TSidecars extends ProviderToolIndexSidecars = ProviderToolIndexSidecars,
	>(): ProviderToolIndex<TDeclarations, TSidecars> {
		return new ProviderToolIndex({
			declarations: [] as unknown as TDeclarations,
		});
	}

	readonly #declarations: TDeclarations;
	readonly #sidecars: TSidecars;
	readonly #identityCatalog: ToolIdentityCatalog;

	constructor(init: {
		declarations: TDeclarations;
		sidecars?: TSidecars;
		identityCatalog?: ToolIdentityCatalog;
	}) {
		this.#declarations = [...init.declarations] as unknown as TDeclarations;
		this.#sidecars = { ...(init.sidecars ?? {}) } as TSidecars;
		this.#identityCatalog = init.identityCatalog ?? ToolIdentityCatalog.empty();
	}

	declarations(): TDeclarations {
		return [...this.#declarations] as unknown as TDeclarations;
	}

	hasDeclarations(): boolean {
		return this.#declarations.length > 0;
	}

	sidecars(): TSidecars {
		return { ...this.#sidecars };
	}

	resolveProviderCall(providerName: string): ToolCallRoute | null {
		const identity = this.#identityCatalog.resolve(providerName);
		return identity ? new ToolCallRoute(identity) : null;
	}

	restoreProviderFunctionCall(options: {
		providerName: string;
		callId: string;
		args: string;
	}): ResponseItem | null {
		return (
			this.resolveProviderCall(options.providerName)?.restore(
				options.callId,
				options.args,
			) ?? null
		);
	}
}

export class ToolCallRoute {
	constructor(private readonly toolIdentity: ToolIdentity) {}

	identity(): ToolIdentity {
		return this.toolIdentity;
	}

	restore(callId: string, args: string): ResponseItem | null {
		switch (this.toolIdentity.type) {
			case "function":
				return createFunctionCall(callId, this.toolIdentity.name, args);
			case "local_shell":
				return localShellCall(callId, args);
			case "shell":
				return shellCall(callId, args);
			case "apply_patch":
				return applyPatchCall(callId, args);
			case "tool_search":
				return toolSearchCall(callId, args, this.toolIdentity.execution);
			case "custom":
				return customToolCall(callId, args, this.toolIdentity.name);
			case "namespace_function":
				return createFunctionCall(
					callId,
					this.toolIdentity.name,
					args,
					this.toolIdentity.namespace,
				);
			case "namespace_custom":
				return customToolCall(
					callId,
					args,
					this.toolIdentity.name,
					this.toolIdentity.namespace,
				);
		}
	}
}

export class ToolIndexSlot {
	#index: ProviderToolIndex | undefined;

	set(index: ProviderToolIndex): void {
		this.#index = index;
	}

	current<TIndex extends ProviderToolIndex = ProviderToolIndex>():
		| TIndex
		| undefined {
		return this.#index as TIndex | undefined;
	}
}

export function ensureToolIndexSlot(ctx: ResponsesContext): ToolIndexSlot {
	const partial = ctx as ResponsesContext & { toolIndex?: ToolIndexSlot };
	if (!partial.toolIndex) partial.toolIndex = new ToolIndexSlot();
	return partial.toolIndex;
}

export function createFunctionCall(
	callId: string,
	name: string,
	args: string,
	namespace?: string,
): FunctionCall {
	return {
		type: "function_call",
		call_id: callId,
		...(namespace ? { namespace } : {}),
		name,
		arguments: args,
	};
}

function localShellCall(callId: string, args: string): LocalShellCall | null {
	const parsed = parsedRecord(args);
	if (!parsed) return null;

	const command = parsed.command;
	if (!isStringArray(command)) return null;

	const action: LocalShellCall["action"] = {
		type: "exec",
		command,
		env: stringRecord(parsed.env),
	};
	const timeoutMs = optionalNumber(parsed.timeout_ms);
	if (timeoutMs !== undefined) action.timeout_ms = timeoutMs;
	const user = optionalString(parsed.user);
	if (user !== undefined) action.user = user;
	const workingDirectory = optionalString(parsed.working_directory);
	if (workingDirectory !== undefined)
		action.working_directory = workingDirectory;

	return {
		id: callId,
		type: "local_shell_call",
		call_id: callId,
		action,
		status: "in_progress",
	};
}

function shellCall(callId: string, args: string): ShellCall | null {
	const parsed = parsedRecord(args);
	if (!parsed) return null;
	const commands = parsed.commands;
	if (!isStringArray(commands)) return null;

	const action: ShellCall["action"] = { commands };
	const timeoutMs = optionalNumber(parsed.timeout_ms);
	if (timeoutMs !== undefined) action.timeout_ms = timeoutMs;
	const maxOutputLength = optionalNumber(parsed.max_output_length);
	if (maxOutputLength !== undefined) action.max_output_length = maxOutputLength;

	return {
		type: "shell_call",
		call_id: callId,
		action,
		status: "in_progress",
	};
}

function applyPatchCall(callId: string, args: string): ResponseItem | null {
	const parsed = parsedRecord(args);
	if (!parsed || !isApplyPatchOperation(parsed.operation)) return null;

	return {
		type: "apply_patch_call",
		call_id: callId,
		operation: parsed.operation,
		status: "in_progress",
	};
}

function toolSearchCall(
	callId: string,
	args: string,
	execution: "server" | "client" | undefined,
): ToolSearchCall {
	return {
		type: "tool_search_call",
		call_id: callId,
		arguments: parseJson(args) ?? args,
		execution: execution ?? "server",
		status: "in_progress",
	};
}

function customToolCall(
	callId: string,
	args: string,
	name: string,
	namespace?: string,
): CustomToolCall {
	const parsed = parseJson(args);
	return {
		type: "custom_tool_call",
		call_id: callId,
		...(namespace ? { namespace } : {}),
		name,
		input: customToolInput(parsed, args),
	};
}

function customToolInput(parsed: unknown, fallback: string): string {
	if (isRecord(parsed) && "input" in parsed) {
		const input = parsed.input;
		if (typeof input === "string") return input;
		return JSON.stringify(input);
	}
	if (typeof parsed === "string") return parsed;
	return fallback;
}

function parsedRecord(value: string): Record<string, unknown> | null {
	const parsed = parseJson(value);
	return isRecord(parsed) ? parsed : null;
}

function parseJson(value: string): unknown | null {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function stringRecord(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};

	const result: Record<string, string> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item === "string") result[key] = item;
	}
	return result;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function isApplyPatchOperation(value: unknown): value is ApplyPatchOperation {
	if (!isRecord(value) || typeof value.type !== "string") return false;
	if (typeof value.path !== "string") return false;
	switch (value.type) {
		case "update_file":
		case "create_file":
			return typeof value.diff === "string";
		case "delete_file":
			return true;
		default:
			return false;
	}
}

function setIfAbsent(
	map: Map<string, ToolIdentity>,
	providerName: string,
	identity: ToolIdentity,
): void {
	if (!map.has(providerName)) map.set(providerName, identity);
}
