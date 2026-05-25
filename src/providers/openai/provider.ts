import type {
	RequestMapper,
	ResponseMapper,
	StreamMapper,
} from "../../adapter/mapper/contract";
import type {
	Provider,
	ProviderClient,
	ProviderMapper,
} from "../../adapter/provider";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionCreateRequest,
} from "../../protocol/openai/completions";
import { OpenAIClient } from "./provider-client";
import { buildOpenAIRequest } from "./request";
import { buildResponseObject } from "./response";
import { OpenAIStreamMapper } from "./stream";

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export const OPENAI_PROVIDER_NAME = "openai";

export interface OpenAIProviderResponsibilities<TReq, TRes, TChunk> {
	name: string;
	client: ProviderClient<TReq, TRes, TChunk>;
	request: RequestMapper<TReq>;
	response: ResponseMapper<TRes>;
	stream: StreamMapper<TChunk>;
}

export class OpenAIProvider<
	TReq = ChatCompletionCreateRequest,
	TRes = ChatCompletion,
	TChunk = ChatCompletionChunk,
> implements Provider<TReq, TRes, TChunk>
{
	readonly name: string;
	readonly mapper: ProviderMapper<TReq, TRes, TChunk>;
	readonly client: ProviderClient<TReq, TRes, TChunk>;

	constructor(baseURL: string, apiKey: string, timeout?: number);
	constructor(
		responsibilities: OpenAIProviderResponsibilities<TReq, TRes, TChunk>,
	);
	constructor(
		baseURLOrResponsibilities:
			| string
			| OpenAIProviderResponsibilities<TReq, TRes, TChunk>,
		apiKey?: string,
		timeout?: number,
	) {
		const responsibilities =
			typeof baseURLOrResponsibilities === "string"
				? (defaultOpenAIResponsibilities(
						baseURLOrResponsibilities,
						apiKey ?? "",
						timeout,
					) as OpenAIProviderResponsibilities<TReq, TRes, TChunk>)
				: baseURLOrResponsibilities;

		this.name = responsibilities.name;
		this.client = responsibilities.client;
		this.mapper = {
			request: responsibilities.request,
			response: responsibilities.response,
			stream: responsibilities.stream,
		};
	}
}

function defaultOpenAIResponsibilities(
	baseURL: string,
	apiKey: string,
	timeout?: number,
): OpenAIProviderResponsibilities<
	ChatCompletionCreateRequest,
	ChatCompletion,
	ChatCompletionChunk
> {
	return {
		name: OPENAI_PROVIDER_NAME,
		client: new OpenAIClient(baseURL, apiKey, timeout),
		request: { map: buildOpenAIRequest },
		response: { map: buildResponseObject },
		stream: new OpenAIStreamMapper(),
	};
}
