import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import * as ts from "typescript";

const SRC_ROOT = new URL(".", import.meta.url).pathname;

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

function reExportStatements(path: string): string[] {
	const source = ts.createSourceFile(
		path,
		readFileSync(path, "utf-8"),
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TS,
	);

	return source.statements
		.filter(
			(statement) =>
				ts.isExportDeclaration(statement) &&
				statement.moduleSpecifier !== undefined,
		)
		.map((statement) => ts.SyntaxKind[statement.kind]);
}

function reExportModuleSpecifiers(path: string): string[] {
	const source = ts.createSourceFile(
		path,
		readFileSync(path, "utf-8"),
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TS,
	);

	return source.statements
		.filter(
			(statement): statement is ts.ExportDeclaration =>
				ts.isExportDeclaration(statement) &&
				statement.moduleSpecifier !== undefined,
		)
		.map((statement) => {
			const specifier = statement.moduleSpecifier;
			return specifier && ts.isStringLiteral(specifier) ? specifier.text : "";
		});
}

function nonExportStatements(path: string): string[] {
	const source = ts.createSourceFile(
		path,
		readFileSync(path, "utf-8"),
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TS,
	);

	return source.statements
		.filter((statement) => {
			return !(
				ts.isExportDeclaration(statement) &&
				statement.moduleSpecifier !== undefined
			);
		})
		.map((statement) => ts.SyntaxKind[statement.kind]);
}

describe("src module boundaries", () => {
	test("every src subdirectory has an index barrel", () => {
		const missing = collectDirectories(SRC_ROOT)
			.filter((directory) => !existsSync(join(directory, "index.ts")))
			.map(srcRelative)
			.sort();

		expect(missing).toEqual([]);
	});

	test("subdirectory index.ts files only re-export local modules", () => {
		const offenders = collectDirectories(SRC_ROOT)
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
		const offenders = collectDirectories(SRC_ROOT)
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
		const offenders = collectTypeScriptFiles(SRC_ROOT)
			.filter((path) => basename(path) !== "index.ts")
			.map((path) => ({
				path: srcRelative(path),
				statements: reExportStatements(path),
			}))
			.filter((offender) => offender.statements.length > 0);

		expect(offenders).toEqual([]);
	});

	test("the root src/index.ts stays an executable entrypoint", () => {
		expect(basename(join(SRC_ROOT, "index.ts"))).toBe("index.ts");
		expect(existsSync(join(SRC_ROOT, "index.ts"))).toBe(true);
	});
});
