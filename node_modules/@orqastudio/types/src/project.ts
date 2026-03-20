export interface Project {
	id: number;
	name: string;
	path: string;
	description: string | null;
	detected_stack: DetectedStack | null;
	created_at: string;
	updated_at: string;
}

export interface ProjectSummary {
	id: number;
	name: string;
	path: string;
	detected_stack: DetectedStack | null;
	session_count: number;
	artifact_count: number;
	updated_at: string;
}

export interface DetectedStack {
	languages: string[];
	frameworks: string[];
	package_manager: string | null;
	has_claude_config: boolean;
	has_design_tokens: boolean;
}

export interface ScanResult {
	project_id: number;
	detected_stack: DetectedStack;
	artifact_counts: Record<string, number>;
	design_tokens_found: boolean;
	scan_duration_ms: number;
}

/** The parent relationship config for a delivery type. */
export interface DeliveryParentConfig {
	type: string;
	/** The relationship type that connects child to parent (e.g. "delivers", "belongs-to"). */
	relationship: string;
}

/** A single delivery type defined in project.json (e.g. milestone, epic, task). */
export interface DeliveryTypeConfig {
	key: string;
	label: string;
	path: string;
	parent?: DeliveryParentConfig | null;
	gate_field?: string | null;
}

/** The delivery configuration block from project.json. */
export interface DeliveryConfig {
	types: DeliveryTypeConfig[];
}

/** A project-level relationship type that extends the canonical vocabulary. */
export interface ProjectRelationshipConfig {
	/** The forward relationship key (e.g. "depends-on"). */
	key: string;
	/** The inverse relationship key (e.g. "depended-on-by"). */
	inverse: string;
	/** Human-readable label for the forward direction. */
	label: string;
	/** Human-readable label for the inverse direction. */
	inverse_label: string;
}

/** Controls how relationship chips display artifact references. */
export interface RelationshipDisplayConfig {
	/** Which field to show on chips: "title" or "id". Default: "title". */
	defaultField: "title" | "id";
	/** Per-artifact-type overrides (e.g. { "task": "id", "epic": "title" }). */
	overrides: Record<string, "title" | "id">;
}

/** Whether artifact link chips display the ID or the resolved title. */
export type ArtifactLinkDisplayMode = "id" | "title";

/** Per-type colour and display settings for artifact link chips. */
export interface ArtifactLinksConfig {
	/** Per-type display mode (e.g. { "EPIC": "title", "TASK": "id" }). Absent prefixes default to "id". */
	displayModes: Record<string, ArtifactLinkDisplayMode>;
	/** Optional per-type prefix hex colour (e.g. { "EPIC": "#3b82f6" }). */
	colors: Record<string, string>;
}

/** Default per-type colours for artifact link chips. */
export const DEFAULT_ARTIFACT_LINK_COLORS: Record<string, string> = {
	EPIC: "#3b82f6",
	TASK: "#06b6d4",
	RULE: "#a78bfa",
	AD: "#8b5cf6",
	IDEA: "#c084fc",
	IMPL: "#67e8f9",
	SKILL: "#2dd4bf",
	PILLAR: "#818cf8",
	RES: "#6366f1",
	MS: "#38bdf8",
	DOC: "#94a3b8",
	AGENT: "#f472b6",
};

/** An automatic transition rule on a status. */
export interface StatusAutoRule {
	condition: string;
	target: string;
}

/** A single status definition from project config — source of truth for status vocabulary. */
export interface StatusDefinition {
	key: string;
	label: string;
	icon: string;
	spin?: boolean;
	transitions?: string[];
	auto_rules?: StatusAutoRule[];
}

/** A child project reference in an organisation-mode project. */
export interface ChildProjectConfig {
	name: string;
	path: string;
}

export interface ProjectSettings {
	name: string;
	/** When true, this project aggregates child projects into a single graph. */
	organisation?: boolean;
	/** Child project paths (relative to project root or absolute). */
	projects?: ChildProjectConfig[];
	description: string | null;
	default_model: string;
	excluded_paths: string[];
	stack: DetectedStack | null;
	governance: GovernanceCounts | null;
	icon: string | null;
	show_thinking: boolean;
	custom_system_prompt: string | null;
	artifacts?: ArtifactEntry[];
	/** Navigation tree — typed, ordered array. Replaces artifacts for view routing when present. */
	navigation?: import("./plugin.js").NavigationItem[];
	/** Per-plugin configuration and overrides. */
	plugins?: Record<string, import("./plugin.js").PluginProjectConfig>;
	statuses?: StatusDefinition[];
	relationshipDisplay?: RelationshipDisplayConfig;
	artifactLinks?: ArtifactLinksConfig;
	delivery?: DeliveryConfig;
	relationships?: ProjectRelationshipConfig[];
}

export interface GovernanceCounts {
	docs: number;
	agents: number;
	rules: number;
	skills: number;
	hooks: number;
	has_claude_config: boolean;
}

export interface ProjectScanResult {
	stack: DetectedStack;
	governance: GovernanceCounts;
	scan_duration_ms: number;
}

/** A single artifact type entry from project.json artifacts config.
 *
 * `label` and `icon` are optional — the scanner reads them from the directory's
 * README.md frontmatter when absent, falling back to a humanized key name.
 */
export interface ArtifactTypeConfig {
	key: string;
	label?: string;
	icon?: string;
	path: string;
}

/** A group entry containing child artifact types.
 *
 * `label` and `icon` are optional — presentation metadata comes from the group
 * directory's README.md frontmatter, not from this config.
 */
export interface ArtifactGroupConfig {
	key: string;
	label?: string;
	icon?: string;
	children: ArtifactTypeConfig[];
}

/** An entry in the artifacts config — either a direct type or a group. */
export type ArtifactEntry = ArtifactTypeConfig | ArtifactGroupConfig;

/** Type guard: is this entry a group (has children)? */
export function isArtifactGroup(entry: ArtifactEntry): entry is ArtifactGroupConfig {
	return "children" in entry;
}

// ---------------------------------------------------------------------------
// Platform Configuration — loaded from platform/core.json
// ---------------------------------------------------------------------------

import type { RelationshipType, NavigationItem, PlatformConfig, PlatformArtifactType as PlatformArtifactTypeInterface } from "./plugin.js";

// Import the platform config data file. This is the single source of truth
// for core artifact types and relationships. Plugins and project config
// extend this at runtime — the platform config is not special-cased in code.
import platformConfigData from "./platform/core.json" with { type: "json" };

/** The loaded platform configuration. */
export const PLATFORM_CONFIG: PlatformConfig = platformConfigData as PlatformConfig;

/**
 * Platform artifact type keys derived from core.json.
 * Backwards-compatible: same shape as the old hardcoded array.
 */
export const PLATFORM_ARTIFACT_TYPES: readonly string[] = PLATFORM_CONFIG.artifactTypes.map(t => t.key);

/** @deprecated Use `PLATFORM_CONFIG.artifactTypes[n].key` instead. */
export type PlatformArtifactType = string;

/**
 * Platform relationships derived from core.json.
 * Backwards-compatible: same RelationshipType[] shape.
 */
export const PLATFORM_RELATIONSHIPS: readonly RelationshipType[] = PLATFORM_CONFIG.relationships;

/**
 * Semantic categories from core.json.
 * Used by checks to query relationship intent without hardcoding keys.
 */
export const PLATFORM_SEMANTICS = PLATFORM_CONFIG.semantics;

/**
 * Default platform navigation groups (principles, learning, discovery).
 * These are the builtin groups that every project starts with.
 * Plugins add their own groups/items via defaultNavigation.
 */
export const PLATFORM_NAVIGATION: readonly NavigationItem[] = [
	{ key: "project", type: "builtin", icon: "layout-dashboard" },
	{
		key: "principles",
		type: "group",
		icon: "landmark",
		label: "Principles",
		children: [
			{ key: "pillars", type: "builtin", icon: "columns-3" },
			{ key: "vision", type: "builtin", icon: "eye" },
			{ key: "personas", type: "builtin", icon: "users" },
			{ key: "grounding", type: "builtin", icon: "anchor" },
		],
	},
	{
		key: "discovery",
		type: "group",
		icon: "compass",
		label: "Discovery",
		children: [
			{ key: "ideas", type: "builtin", icon: "lightbulb" },
		],
	},
	{
		key: "learning",
		type: "group",
		icon: "brain",
		label: "Learning",
		children: [
			{ key: "decisions", type: "builtin", icon: "scale" },
			{ key: "rules", type: "builtin", icon: "shield" },
			{ key: "lessons", type: "builtin", icon: "book-open" },
			{ key: "skills", type: "builtin", icon: "zap" },
			{ key: "agents", type: "builtin", icon: "bot" },
		],
	},
	{ key: "artifact-graph", type: "builtin", icon: "network" },
	{ key: "settings", type: "builtin", icon: "settings" },
] as const;
