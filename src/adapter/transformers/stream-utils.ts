export function enqueue<T>(
	controller:
		| ReadableStreamDefaultController<T>
		| TransformStreamDefaultController<T>,
	chunk: T,
): boolean {
	try {
		controller.enqueue(chunk);
		return true;
	} catch (err) {
		if (isClosedControllerError(err)) return false;
		throw err;
	}
}

export function pipeTransform<I, O>(
	stream: ReadableStream<I>,
	transformer: Transformer<I, O>,
): ReadableStream<O> {
	return stream.pipeThrough(new TransformStream(transformer));
}

export function enqueueEncoded(
	controller: TransformStreamDefaultController<Uint8Array>,
	encoder: TextEncoder,
	payload: string,
): boolean {
	return enqueue(controller, encoder.encode(payload));
}

export function isClosedControllerError(err: unknown): boolean {
	return (
		err instanceof TypeError &&
		String(err).includes("Controller is already closed")
	);
}
