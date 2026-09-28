export function isCommanderExit(err: unknown): err is { exitCode: number } {
	return (
		typeof err === "object" &&
		err !== null &&
		"exitCode" in err &&
		typeof (err as { exitCode: unknown }).exitCode === "number"
	);
}
