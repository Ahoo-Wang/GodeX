import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const SRC_ROOT = fileURLToPath(new URL(".", import.meta.url));
const ROOT_INDEX = join(SRC_ROOT, "index.ts");

function srcRelative(path: string): string {
	return relative(SRC_ROOT, path).split(/[\\/]/).join("/");
}

function createSourceFile(path: string): ts.SourceFile {
	return ts.createSourceFile(
		path,
		readFileSync(path, "utf-8"),
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TS,
	);
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

function moduleSpecifierText(statement: ts.ExportDeclaration): string {
	const specifier = statement.moduleSpecifier;
	return specifier && ts.isStringLiteral(specifier) ? specifier.text : "";
}

function reExportDetails(path: string): string[] {
	const source = createSourceFile(path);

	return source.statements
		.filter(
			(statement): statement is ts.ExportDeclaration =>
				ts.isExportDeclaration(statement) &&
				statement.moduleSpecifier !== undefined,
		)
		.map(
			(statement) =>
				`${moduleSpecifierText(statement)}: ${statement.getText(source)}`,
		);
}

function reExportModuleSpecifiers(path: string): string[] {
	const source = createSourceFile(path);

	return source.statements
		.filter(
			(statement): statement is ts.ExportDeclaration =>
				ts.isExportDeclaration(statement) &&
				statement.moduleSpecifier !== undefined,
		)
		.map(moduleSpecifierText);
}

function nonExportStatements(path: string): string[] {
	const source = createSourceFile(path);

	return source.statements
		.filter((statement) => {
			return !(
				ts.isExportDeclaration(statement) &&
				statement.moduleSpecifier !== undefined
			);
		})
		.map((statement) => statement.getText(source));
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
