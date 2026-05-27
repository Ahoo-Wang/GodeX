export interface ResolvedModel {
	provider: string;
	model: string;
}

export function parseProviderModelReference(
	value: string,
): ResolvedModel | undefined {
	const slashIndex = value.indexOf("/");
	if (slashIndex <= 0 || slashIndex === value.length - 1) {
		return undefined;
	}

	return {
		provider: value.slice(0, slashIndex),
		model: value.slice(slashIndex + 1),
	};
}
