import type { ResolvedModel } from "../resolver";
import type { TraceRecorder } from "./recorder";

export interface TraceRecordingContext {
	requestId: string;
	responseId: string;
	resolved: ResolvedModel;
	app: {
		traceEnabled: boolean;
		traceRecorder: TraceRecorder;
	};
}
