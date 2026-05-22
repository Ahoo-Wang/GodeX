/** Runtime environment identifier. */
export enum Env {
	Development = "dev",
	Production = "prod",
}

declare const GODEX_BUILD_ENV: string | undefined;

/**
 * Static helper that resolves the current Godex environment from the
 * compile-time define `GODEX_BUILD_ENV`.
 *
 * Only `GODEX_BUILD_ENV` is asserted — no dependency on `NODE_ENV`.
 */
export const EnvVars = {
	/** Resolved runtime environment. */
	get current(): Env {
		if (typeof GODEX_BUILD_ENV !== "undefined")
			return GODEX_BUILD_ENV === "production"
				? Env.Production
				: Env.Development;
		return Env.Development;
	},

	get isDev(): boolean {
		return this.current === Env.Development;
	},

	get isProd(): boolean {
		return this.current === Env.Production;
	},
};
