export function pipeTransform<I, O>(
	stream: ReadableStream<I>,
	transformer: Transformer<I, O>,
): ReadableStream<O> {
	return stream.pipeThrough(new TransformStream(transformer));
}
