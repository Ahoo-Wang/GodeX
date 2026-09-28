import type {
	ContainerMemoryLimit,
	ContainerNetworkPolicy,
	InlineSkill,
	LocalSkill,
	SkillReference,
} from "../shared";

export interface ContainerAuto {
	type: "container_auto";
	file_ids?: string[];
	memory_limit?: ContainerMemoryLimit;
	network_policy?: ContainerNetworkPolicy;
	skills?: (SkillReference | InlineSkill)[];
}

export interface LocalEnvironment {
	type: "local";
	skills?: LocalSkill[];
}

export interface ContainerReference {
	type: "container_reference";
	container_id: string;
}

export type ShellCallEnvironment =
	| ContainerAuto
	| LocalEnvironment
	| ContainerReference;
