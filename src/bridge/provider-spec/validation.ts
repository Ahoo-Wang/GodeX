export interface ProviderPackageViolation {
	readonly provider: string;
	readonly path: string;
	readonly reason: string;
}

const requiredFiles = ["spec.ts", "client.ts", "index.ts"] as const;
const allowedFiles = new Set<string>([...requiredFiles, "hooks.ts"]);

export function validateProviderPackageShape(
	provider: string,
	paths: readonly string[],
): ProviderPackageViolation[] {
	const prefix = `src/providers/${provider}/`;
	const violations: ProviderPackageViolation[] = [];
	for (const path of paths) {
		if (path.startsWith(`${prefix}mapper/`)) {
			violations.push({
				provider,
				path,
				reason: "ProviderSpec providers must not contain mapper/ files.",
			});
		}
	}
	for (const path of paths) {
		if (!path.startsWith(prefix)) continue;
		if (path.endsWith(".test.ts")) continue;
		if (path.startsWith(`${prefix}mapper/`)) continue;
		if (path.startsWith(`${prefix}protocol/`)) continue;
		const file = path.slice(prefix.length);
		if (!allowedFiles.has(file)) {
			violations.push({
				provider,
				path,
				reason:
					"ProviderSpec providers may only expose spec.ts, client.ts, index.ts, hooks.ts, tests, and protocol DTOs.",
			});
		}
	}
	for (const file of requiredFiles) {
		const path = `${prefix}${file}`;
		if (!paths.includes(path)) {
			violations.push({
				provider,
				path,
				reason: `ProviderSpec providers must expose ${file}.`,
			});
		}
	}
	return violations;
}
