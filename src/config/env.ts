declare const GODEX_BUILD_ENV: string | undefined;

export function isDevMode(): boolean {
	if (typeof GODEX_BUILD_ENV !== "undefined")
		return GODEX_BUILD_ENV !== "production";
	return (
		process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev"
	);
}
