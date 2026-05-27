export type RawConfigObject = Record<string, unknown>;

export function asConfigObject(value: unknown): RawConfigObject {
	return typeof value === "object" && value !== null
		? (value as RawConfigObject)
		: {};
}
