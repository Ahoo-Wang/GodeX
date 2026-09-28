export type RawConfigObject = Record<string, unknown>;

export function createConfigMap<Value>(): Record<string, Value> {
	return Object.create(null) as Record<string, Value>;
}

export function asConfigObject(value: unknown): RawConfigObject {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as RawConfigObject)
		: createConfigMap();
}
