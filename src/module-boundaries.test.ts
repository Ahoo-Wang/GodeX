import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = fileURLToPath(new URL(".", import.meta.url));
const ROOT_INDEX = join(SRC_ROOT, "index.ts");

function srcRelative(path: string): string {
	return relative(SRC_ROOT, path).split(/[\\/]/).join("/");
}

function collectDirectories(path: string): string[] {
	const directories: string[] = [];
	for (const entry of readdirSync(path)) {
		const child = join(path, entry);
		if (!statSync(child).isDirectory()) continue;
		directories.push(child, ...collectDirectories(child));
	}
	return directories;
}

function collectTypeScriptFiles(path: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(path)) {
		const child = join(path, entry);
		const stat = statSync(child);
		if (stat.isDirectory()) {
			files.push(...collectTypeScriptFiles(child));
			continue;
		}
		if (stat.isFile() && entry.endsWith(".ts")) {
			files.push(child);
		}
	}
	return files;
}

/**
 * A top-level TypeScript statement: its trimmed source text plus, when it is an
 * `export ... from "..."` re-export, the module specifier it re-exports from.
 */
interface Statement {
	text: string;
	moduleSpecifier: string | undefined;
}

/**
 * Returns true when the statement is an `export ... from "..."` re-export.
 *
 * This mirrors the previous TypeScript-compiler-based check
 * (`ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined`),
 * which matched `export * from`, `export { ... } from` and `export type { ... } from`
 * but not local exports (`export { x }`), `export default`, or non-export statements.
 */
function isReExport(statement: Statement): boolean {
	return (
		statement.moduleSpecifier !== undefined &&
		/^\s*export\b/.test(statement.text)
	);
}

/**
 * Splits a TypeScript source file into its top-level statements without depending
 * on the TypeScript compiler.
 *
 * TypeScript v7 moved the compiler API out of the main `typescript` import into
 * `./unstable/*` subpaths, and those subpaths no longer expose a synchronous
 * text-to-AST parser (`ts.createSourceFile`). This module-boundaries test only
 * needs to identify top-level statements and their `export ... from "..."` module
 * specifiers, which a small bracket/string/comment-aware splitter can do reliably
 * for the regular statement shapes used in this codebase.
 */
function parseTopLevelStatements(source: string): Statement[] {
	const statements: Statement[] = [];
	const length = source.length;
	let statementStart = 0;
	// Depth of nested (), [], {} currently open. Top-level statements live at depth 0.
	let depth = 0;
	let i = 0;

	while (i < length) {
		const char = source[i];
		const next = source[i + 1];

		// Line comment: skip to end of line.
		if (char === "/" && next === "/") {
			const newline = source.indexOf("\n", i);
			i = newline === -1 ? length : newline;
			continue;
		}
		// Block comment: skip to closing */.
		if (char === "/" && next === "*") {
			const close = source.indexOf("*/", i + 2);
			i = close === -1 ? length : close + 2;
			continue;
		}
		// String/template/regex-like literals: skip to their matching close so any
		// braces, parens or semicolons they contain do not affect nesting.
		if (char === '"' || char === "'" || char === "`") {
			i = skipStringLike(source, i, char);
			continue;
		}

		if (char === "(" || char === "[" || char === "{") {
			depth++;
			i++;
			continue;
		}
		if (char === ")" || char === "]" || char === "}") {
			depth = Math.max(0, depth - 1);
			i++;
			continue;
		}

		// A semicolon at the top level ends the current statement (include the
		// semicolon in the statement text, matching ts.Statement.getText()).
		if (char === ";" && depth === 0) {
			pushStatement(statements, source, statementStart, i + 1);
			statementStart = i + 1;
			i++;
			continue;
		}

		i++;
	}

	// Trailing statement without a terminating semicolon (e.g. the final export in a barrel).
	if (statementStart < length) {
		pushStatement(statements, source, statementStart, length);
	}

	return statements;
}

function pushStatement(
	statements: Statement[],
	source: string,
	start: number,
	end: number,
): void {
	// Trim leading whitespace and comments (which the TypeScript compiler attaches
	// outside a statement's own text range) so the statement text starts at its
	// first real token, matching ts.Statement.getText().
	let text = source.slice(start, end);
	text = stripLeadingTrivia(text).replace(/\s+$/, "");
	if (text.length === 0) return;
	statements.push({ text, moduleSpecifier: extractModuleSpecifier(text) });
}

/** Removes leading whitespace and `//`/`/* *​/` comments from a statement. */
function stripLeadingTrivia(text: string): string {
	let i = 0;
	while (i < text.length) {
		// Skip whitespace.
		const ws = text.slice(i).match(/^\s+/);
		if (ws) {
			i += ws[0].length;
			continue;
		}
		// Skip a line comment.
		if (text[i] === "/" && text[i + 1] === "/") {
			const nl = text.indexOf("\n", i);
			i = nl === -1 ? text.length : nl;
			continue;
		}
		// Skip a block comment.
		if (text[i] === "/" && text[i + 1] === "*") {
			const close = text.indexOf("*/", i + 2);
			i = close === -1 ? text.length : close + 2;
			continue;
		}
		break;
	}
	return text.slice(i);
}

/**
 * Skips a `"..."`, `'...'` or `` `...` `` (template) literal starting at `start`,
 * returning the index just past the closing quote. Handles backslash escapes and
 * (for templates) `${ ... }` interpolation by re-entering nested tracking.
 */
function skipStringLike(source: string, start: number, quote: string): number {
	let i = start + 1;
	const length = source.length;
	while (i < length) {
		const char = source[i];
		if (char === "\\") {
			i += 2;
			continue;
		}
		// Template literal interpolation: ${ ... } may contain arbitrary expressions,
		// so recurse over the main scanner until the matching brace balances.
		if (quote === "`" && char === "$" && source[i + 1] === "{") {
			i += 2;
			let depth = 1;
			while (i < length && depth > 0) {
				const c = source[i];
				if (c === "{" || c === "(" || c === "[") {
					depth++;
				} else if (c === ")" || c === "]" || c === "}") {
					depth--;
				} else if (c === '"' || c === "'" || c === "`") {
					i = skipStringLike(source, i, c);
					continue;
				} else if (
					c === "/" &&
					(source[i + 1] === "/" || source[i + 1] === "*")
				) {
					if (source[i + 1] === "/") {
						const nl = source.indexOf("\n", i);
						i = nl === -1 ? length : nl;
					} else {
						const close = source.indexOf("*/", i + 2);
						i = close === -1 ? length : close + 2;
					}
					continue;
				}
				i++;
			}
			continue;
		}
		if (char === quote) {
			return i + 1;
		}
		i++;
	}
	return length;
}

/**
 * Extracts the module specifier from a statement of the form
 * `... from "..."` (or `import "..."`), mirroring `ExportDeclaration.moduleSpecifier`.
 * Returns the unquoted specifier text, or `undefined` when the statement has none.
 */
function extractModuleSpecifier(text: string): string | undefined {
	const fromMatch = text.match(/\bfrom\s*(['"])(.*?)\1\s*;?\s*$/s);
	if (fromMatch) return fromMatch[2];
	// Side-effect / bare import: `import "..."`.
	const importMatch = text.match(/^\s*import\s*(['"])(.*?)\1\s*;?\s*$/s);
	if (importMatch) return importMatch[2];
	return undefined;
}

function statementsOf(path: string): Statement[] {
	return parseTopLevelStatements(readFileSync(path, "utf-8"));
}

function reExportDetails(path: string): string[] {
	return statementsOf(path)
		.filter(isReExport)
		.map((statement) => `${statement.moduleSpecifier}: ${statement.text}`);
}

function reExportModuleSpecifiers(path: string): string[] {
	return statementsOf(path)
		.filter(isReExport)
		.map((statement) => statement.moduleSpecifier ?? "");
}

function nonExportStatements(path: string): string[] {
	return statementsOf(path)
		.filter((statement) => !isReExport(statement))
		.map((statement) => statement.text);
}

describe("src module boundaries", () => {
	const sourceDirectories = collectDirectories(SRC_ROOT).sort();
	const sourceFiles = collectTypeScriptFiles(SRC_ROOT).sort();

	test("every src subdirectory has an index barrel", () => {
		const missing = sourceDirectories
			.filter((directory) => !existsSync(join(directory, "index.ts")))
			.map(srcRelative)
			.sort();

		expect(missing).toEqual([]);
	});

	test("subdirectory index.ts files only re-export local modules", () => {
		const offenders = sourceDirectories
			.map((directory) => join(directory, "index.ts"))
			.filter(existsSync)
			.map((indexPath) => ({
				path: srcRelative(indexPath),
				statements: nonExportStatements(indexPath),
			}))
			.filter((offender) => offender.statements.length > 0);

		expect(offenders).toEqual([]);
	});

	test("subdirectory index.ts files only re-export modules from their own directory", () => {
		const offenders = sourceDirectories
			.map((directory) => join(directory, "index.ts"))
			.filter(existsSync)
			.map((indexPath) => ({
				path: srcRelative(indexPath),
				specifiers: reExportModuleSpecifiers(indexPath).filter(
					(specifier) => !specifier.startsWith("./"),
				),
			}))
			.filter((offender) => offender.specifiers.length > 0);

		expect(offenders).toEqual([]);
	});

	test("non-index TypeScript modules do not re-export other modules", () => {
		const offenders = sourceFiles
			.filter((path) => basename(path) !== "index.ts")
			.map((path) => ({
				path: srcRelative(path),
				statements: reExportDetails(path),
			}))
			.filter((offender) => offender.statements.length > 0);

		expect(offenders).toEqual([]);
	});

	test("legacy runtime mapper and provider wrapper modules stay removed", () => {
		const legacyRuntimeDir = ["adapt", "er"].join("");
		const forbidden = [
			legacyRuntimeDir,
			[legacyRuntimeDir, "mapper"].join("/"),
			[legacyRuntimeDir, "provider.ts"].join("/"),
			[
				legacyRuntimeDir,
				"transformers",
				"provider-event-to-response-transformer.ts",
			].join("/"),
			"providers/shared/response-message-payloads.ts",
		].filter((path) => existsSync(join(SRC_ROOT, path)));

		expect(forbidden).toEqual([]);
	});

	test("output contract slot is accessed as a ResponsesContext field", () => {
		const source = readFileSync(
			join(SRC_ROOT, "context", "output-contract-slot.ts"),
			"utf-8",
		);

		expect(source).not.toContain("ensureOutputContractSlot");
	});

	test("bridge production modules do not import responses runtime context", () => {
		const bridgeRoot = join(SRC_ROOT, "bridge");
		const offenders = collectTypeScriptFiles(bridgeRoot)
			.filter((path) => !path.endsWith(".test.ts"))
			.map((path) => ({
				path: srcRelative(path),
				importLines: readFileSync(path, "utf-8")
					.split("\n")
					.filter((line) => /^\s*(import|export)\b/.test(line)),
			}))
			.filter((candidate) =>
				candidate.importLines.some(
					(line) =>
						line.includes("/context/") || line.includes("responses-context"),
				),
			);

		expect(offenders).toEqual([]);
	});

	test("legacy bridge planner APIs stay removed", () => {
		const forbiddenSymbols = [
			"BridgeCompatibilityProfile",
			"BridgeIgnoredParameterRule",
			"CHAT_COMPLETIONS_COMMON_IGNORED_PARAMETERS",
			"RESPONSES_ENVELOPE_IGNORED_PARAMETERS",
			"planBridgeCompatibilityFromInput",
			"BridgeToolPlan",
			"BridgeToolChoicePlan",
			"planBridgeTools",
			"recordBridgeToolPlan",
		];
		const offenders = collectTypeScriptFiles(join(SRC_ROOT, "bridge"))
			.filter((path) => !path.endsWith(".test.ts"))
			.flatMap((path) => {
				const source = readFileSync(path, "utf-8");
				return forbiddenSymbols
					.filter((symbol) => source.includes(symbol))
					.map((symbol) => ({ path: srcRelative(path), symbol }));
			});

		expect(offenders).toEqual([]);
	});

	test("unused bridge dialect and observation modules stay removed", () => {
		const forbidden = ["bridge/dialect", "bridge/observation"].filter((path) =>
			existsSync(join(SRC_ROOT, path)),
		);

		expect(forbidden).toEqual([]);
	});

	test("the root src/index.ts stays an executable entrypoint", () => {
		expect(basename(ROOT_INDEX)).toBe("index.ts");
		expect(existsSync(ROOT_INDEX)).toBe(true);
		expect(nonExportStatements(ROOT_INDEX)).toEqual([
			'import { runCli } from "./cli";',
			"process.exitCode = await runCli(process.argv);",
		]);
	});
});

import * as openaiProtocol from "./protocol/openai";

test("session runtime helpers do not leak through the OpenAI protocol barrel", () => {
	expect("SessionError" in openaiProtocol).toBe(false);
});
