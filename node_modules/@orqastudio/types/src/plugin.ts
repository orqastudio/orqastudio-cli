/**
 * Plugin manifest types for the OrqaStudio plugin system.
 *
 * Plugins declare schemas (artifact type definitions) and views (UI components)
 * separately. A plugin can provide schemas only, views only, or both.
 * View-only plugins declare `requires` on schema plugins.
 */

// ---------------------------------------------------------------------------
// Artifact Schema
// ---------------------------------------------------------------------------

/** Frontmatter field specification for an artifact schema. */
export interface ArtifactSchemaFrontmatter {
	/** Fields that must be present in the frontmatter. */
	required: string[];
	/** Fields that may be present in the frontmatter. */
	optional: string[];
}

/** An artifact type schema provided by a plugin. */
export interface ArtifactSchema {
	/** Unique artifact type key (lowercase, hyphenated). */
	key: string;
	/** Singular display label. */
	label: string;
	/** Plural display label. */
	plural?: string;
	/** Lucide icon name. */
	icon: string;
	/** Default relative path within `.orqa/` where artifacts live. */
	defaultPath: string;
	/** ID prefix for this type (e.g. "EPIC", "TASK"). */
	idPrefix: string;
	/** Frontmatter field specification. */
	frontmatter: ArtifactSchemaFrontmatter;
	/** Status transition rules specific to this type. */
	statusTransitions: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Backend Capability Registrations
// ---------------------------------------------------------------------------

/** A system binary requirement for a plugin capability. */
export interface SystemRequirement {
	/** Binary name (e.g. "node", "bun", "cargo"). */
	binary: string;
	/** Minimum semver version, if any. */
	minVersion?: string;
}

/** A long-running sidecar process provided by a plugin. */
export interface SidecarRegistration {
	/** Unique sidecar key (e.g. "claude-agent"). */
	key: string;
	/** Display label. */
	label: string;
	/** Runtime used to execute the sidecar. */
	runtime: "node";
	/** Entrypoint path relative to the plugin root (e.g. "dist/sidecar.js"). */
	entrypoint: string;
	/** Additional CLI arguments. */
	args?: string[];
	/** System binaries required to run this sidecar. */
	requires?: SystemRequirement[];
}

/** A one-shot CLI tool (command) provided by a plugin. */
export interface CliToolRegistration {
	/** Unique tool key (e.g. "integrity-check", "eslint"). */
	key: string;
	/** Display label. */
	label: string;
	/** Lucide icon name. */
	icon: string;
	/** Runtime used to execute the tool. */
	runtime: "node" | "system";
	/** Entrypoint path relative to the plugin root. */
	entrypoint: string;
	/** Additional CLI arguments. */
	args?: string[];
	/** Tool category for grouping in the UI. */
	category: "integrity" | "lint" | "test" | "build" | "custom";
	/** Endpoint for AD-042 verification snapshots. */
	dataEndpoint?: string;
}


/** A hook provided by a plugin, triggered on specific events. */
export interface HookRegistration {
	/** Unique hook key. */
	key: string;
	/** Event that triggers this hook. */
	event: "pre-commit" | "post-commit" | "pre-push" | "artifact-change" | "session-start";
	/** Runtime used to execute the hook. */
	runtime: "node" | "system";
	/** Entrypoint path relative to the plugin root. */
	entrypoint: string;
	/** Additional CLI arguments. */
	args?: string[];
}

// ---------------------------------------------------------------------------
// View & Widget Registrations
// ---------------------------------------------------------------------------

/** A view registration provided by a plugin. */
export interface ViewRegistration {
	/** Unique view key used in navigation routing. */
	key: string;
	/** Display label for the view. */
	label: string;
	/** Lucide icon name. */
	icon: string;
}

/** A widget registration provided by a plugin. */
export interface WidgetRegistration {
	/** Unique widget key. */
	key: string;
	/** Display label for the widget. */
	label: string;
	/** Lucide icon name. */
	icon: string;
	/** Default dashboard position (row, col). */
	defaultPosition?: { row: number; col: number };
	/** Default grid span (rows, cols). */
	defaultSpan?: { rows: number; cols: number };
}

// ---------------------------------------------------------------------------
// Relationship Type
// ---------------------------------------------------------------------------

/**
 * Validation constraints for a relationship type.
 *
 * These are evaluated generically by both the CLI and Rust validators —
 * no custom check code per relationship type. The schema IS the rule.
 */
export interface RelationshipConstraints {
	/** Whether at least one instance of this relationship is required on the source type. */
	required?: boolean;
	/** Minimum number of instances (defaults to 0 if not required, 1 if required). */
	minCount?: number;
	/** Maximum number of instances (defaults to unlimited). */
	maxCount?: number;
	/** If true, the inverse edge must exist on the target (defaults to true for all relationships). */
	requireInverse?: boolean;
	/** Status-dependent rules evaluated against the graph state. */
	statusRules?: RelationshipStatusRule[];
}

/**
 * A status-dependent constraint on a relationship.
 *
 * Example: "if a task has depends-on targets that are not completed,
 * the task's status should be blocked."
 */
export interface RelationshipStatusRule {
	/** When to evaluate: "source" checks the source artifact, "target" checks the target. */
	evaluate: "source" | "target";
	/** Condition on the related artifact's status. */
	condition: "all-targets-in" | "any-target-in" | "no-targets-in";
	/** Status values for the condition. */
	statuses: string[];
	/** What to propose for the evaluated artifact's status. */
	proposedStatus: string;
	/** Human-readable description of this rule. */
	description: string;
}

/**
 * A typed relationship that can be used in artifact frontmatter.
 *
 * Used by both platform (canonical) relationships and plugin relationships.
 * Both the CLI validator and the Rust validator evaluate these schemas
 * generically — the schema IS the validation rule.
 */
export interface RelationshipType {
	/** Forward relationship key (e.g. "delivers"). */
	key: string;
	/** Inverse relationship key (e.g. "delivered-by"). */
	inverse: string;
	/** Forward display label (e.g. "Delivers"). */
	label: string;
	/** Inverse display label (e.g. "Delivered By"). */
	inverseLabel: string;
	/** Artifact type keys that can be the source. */
	from: string[];
	/** Artifact type keys that can be the target. */
	to: string[];
	/** Human-readable description of the relationship. */
	description: string;
	/** Semantic category (e.g. "lineage", "hierarchy", "governance"). */
	semantic?: string;
	/** Validation constraints — evaluated generically by both validators. */
	constraints?: RelationshipConstraints;
}

/** A platform artifact type declaration. */
export interface PlatformArtifactType {
	key: string;
	label: string;
	icon: string;
	idPrefix: string;
}

/** Semantic category grouping relationship keys by intent. */
export interface RelationshipSemantic {
	description: string;
	keys: string[];
}

/** Platform core configuration — loaded from platform/core.json. */
export interface PlatformConfig {
	artifactTypes: PlatformArtifactType[];
	relationships: RelationshipType[];
	semantics: Record<string, RelationshipSemantic>;
}

// ---------------------------------------------------------------------------
// Settings Registration
// ---------------------------------------------------------------------------

/** Settings panel registration for a plugin. */
export interface SettingsRegistration {
	/** Relative path to the Svelte settings component. */
	entrypoint: string;
}

// ---------------------------------------------------------------------------
// Default Navigation
// ---------------------------------------------------------------------------

/** A recommended navigation tree addition from a plugin. */
export interface DefaultNavItem {
	/** Navigation item key. */
	key: string;
	/** Item type: "plugin" for plugin views, "group" for containers. */
	type: "plugin" | "group";
	/** Lucide icon name. */
	icon: string;
	/** Display label (required for groups). */
	label?: string;
	/** Plugin source identifier (required for plugin items). */
	pluginSource?: string;
	/** Children for group items. */
	children?: DefaultNavItem[];
}

// ---------------------------------------------------------------------------
// Plugin Manifest
// ---------------------------------------------------------------------------

/** The full plugin manifest (read from `orqa-plugin.json`). */
export interface PluginManifest {
	/** Package name (e.g. "@orqastudio/plugin-software-project"). */
	name: string;
	/** Semver version string. */
	version: string;
	/** Human-readable display name. */
	displayName?: string;
	/** Short description of what the plugin does. */
	description?: string;
	/** Plugin dependencies — other plugin names that must be loaded first. */
	requires?: string[];
	/**
	 * Sidecar key(s) this plugin requires at runtime.
	 * If specified, the plugin is only loaded when a matching sidecar provider
	 * is registered and active. Used for capability routing.
	 */
	requiresSidecar?: string | string[];
	/** Capabilities this plugin provides. */
	provides: PluginProvides;
	/** Settings panel registration. */
	settings?: SettingsRegistration;
	/** Recommended navigation tree additions. */
	defaultNavigation?: DefaultNavItem[];
	/**
	 * Recorded decisions from previous installations when relationship or
	 * artifact type keys collided with core or other plugins.
	 * Stored so that plugin updates can resolve automatically.
	 */
	mergeDecisions?: MergeDecision[];
}

/**
 * A recorded decision about a key collision during plugin installation.
 *
 * The `semantic` and `description` fields of the colliding definitions are
 * compared to assess intent but are NOT editable — they represent the
 * plugin author's declared intent.
 */
export interface MergeDecision {
	/** The relationship or schema key that collided. */
	key: string;
	/** What was decided: "merged" (union from/to) or "renamed" (key namespaced). */
	decision: "merged" | "renamed";
	/** The original key name if renamed (before namespacing). */
	originalKey?: string;
	/** The source that owns the existing definition ("core" or a plugin name). */
	existingSource: string;
}

/**
 * A detected collision between a plugin's key and an existing definition.
 * Returned during installation so the UI/CLI can prompt the user.
 */
export interface KeyCollision {
	/** The colliding key name. */
	key: string;
	/** Who owns the existing definition ("core" or a plugin name). */
	existingSource: string;
	/** The existing definition's description (read-only). */
	existingDescription: string;
	/** The existing definition's semantic category (read-only). */
	existingSemantic?: string;
	/** The existing definition's from types. */
	existingFrom: string[];
	/** The existing definition's to types. */
	existingTo: string[];
	/** The incoming plugin's description (read-only). */
	incomingDescription: string;
	/** The incoming plugin's semantic category (read-only). */
	incomingSemantic?: string;
	/** The incoming plugin's from types. */
	incomingFrom: string[];
	/** The incoming plugin's to types. */
	incomingTo: string[];
	/** Whether the semantic categories match (suggests same intent). */
	semanticMatch: boolean;
}

/** The `provides` block of a plugin manifest. */
export interface PluginProvides {
	/** Artifact type schemas this plugin introduces. */
	schemas: ArtifactSchema[];
	/** Views this plugin registers. */
	views: ViewRegistration[];
	/** Dashboard widgets this plugin registers. */
	widgets: WidgetRegistration[];
	/** Relationship types this plugin introduces. */
	relationships: RelationshipType[];
	/** Long-running sidecar process (at most one per plugin). */
	sidecar?: SidecarRegistration;
	/** One-shot CLI tools (commands) this plugin provides. */
	cliTools?: CliToolRegistration[];
	/** Hooks triggered on specific events. */
	hooks?: HookRegistration[];
}

// ---------------------------------------------------------------------------
// Navigation Model (project.json)
// ---------------------------------------------------------------------------

/** Navigation item type. */
export type NavItemType = "builtin" | "plugin" | "group";

/** A single item in the navigation tree stored in project.json. */
export interface NavigationItem {
	/** Unique key for this nav item. */
	key: string;
	/** How this item is resolved. */
	type: NavItemType;
	/** Lucide icon name. */
	icon: string;
	/** Display label (required for groups, optional for others — resolved from registry). */
	label?: string;
	/** Plugin that provides this view (required when type === "plugin"). */
	pluginSource?: string;
	/** Children (only for type === "group"). */
	children?: NavigationItem[];
	/** Whether this item is hidden in the nav. */
	hidden?: boolean;
}

// ---------------------------------------------------------------------------
// Plugin Config (stored in project.json)
// ---------------------------------------------------------------------------

/** An alias mapping: canonical plugin key → project-local key. */
export interface AliasMapping {
	/** The project-local key used in frontmatter. */
	alias: string;
	/** Override display label (optional — defaults to plugin's label). */
	label?: string;
}

/** Per-plugin configuration stored in project.json under `plugins.<name>`. */
export interface PluginProjectConfig {
	/** Whether this plugin is enabled. */
	enabled: boolean;
	/** Per-relationship overrides (key → enabled). */
	relationships?: Record<string, boolean>;
	/** Schema key aliases — resolves conflicts when multiple plugins register the same key. */
	schemaAliases?: Record<string, AliasMapping>;
	/** Relationship key aliases — resolves conflicts when multiple plugins register the same key. */
	relationshipAliases?: Record<string, AliasMapping>;
	/** Plugin-specific settings. */
	config?: Record<string, unknown>;
}

/** AI-generated suggestion for resolving a plugin conflict. */
export interface ConflictResolutionSuggestion {
	/** The conflicting key. */
	key: string;
	/** Which plugin to rename ("existing", "new", or "both"). */
	strategy: "rename-existing" | "rename-new" | "rename-both";
	/** Suggested alias for the existing plugin's key. */
	existingAlias?: string;
	/** Suggested alias for the new plugin's key. */
	newAlias?: string;
	/** Human-readable explanation of why this suggestion makes sense. */
	rationale: string;
}

/** AI provider routing configuration stored in project.json under `providers`. */
export interface ProviderConfig {
	/** The active sidecar provider key (matches a SidecarRegistration.key). */
	activeSidecar?: string;
	/**
	 * Per-capability routing overrides.
	 * Maps capability names to provider keys.
	 * project config > plugin defaults > app baseline.
	 */
	capabilities?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// CLI Tool Runner Results (returned by Tauri commands)
// ---------------------------------------------------------------------------

/** Result of executing a plugin-registered CLI tool. */
export interface CliToolRunResult {
	/** Plugin that owns the tool. */
	plugin: string;
	/** Tool key. */
	tool_key: string;
	/** Exit code (0 = success). */
	exit_code: number;
	/** Captured stdout. */
	stdout: string;
	/** Captured stderr. */
	stderr: string;
	/** Execution duration in milliseconds. */
	duration_ms: number;
	/** Unix timestamp (seconds) when the run completed. */
	completed_at: number;
}


/** Status snapshot for a registered CLI tool. */
export interface CliToolRunStatus {
	/** Tool key. */
	tool_key: string;
	/** Plugin that owns the tool. */
	plugin: string;
	/** Display label. */
	label: string;
	/** Whether the last run succeeded. */
	success: boolean | null;
	/** Unix timestamp (seconds) of the last run. */
	last_run: number | null;
	/** Duration of the last run in milliseconds. */
	last_duration_ms: number | null;
	/** Human-readable summary. */
	summary: string | null;
}


// ---------------------------------------------------------------------------
// Plugin Registry & Distribution Types
// ---------------------------------------------------------------------------

/** A plugin entry in a registry catalog (official or community). */
export interface RegistryEntry {
	/** Package name (e.g. "@orqastudio/plugin-claude"). */
	name: string;
	/** Human-readable display name. */
	displayName: string;
	/** Short description. */
	description: string;
	/** GitHub repo (owner/repo format). */
	repo: string;
	/** Plugin category for browsing. */
	category: string;
	/** Lucide icon name. */
	icon: string;
	/** Capabilities this plugin provides. */
	capabilities: string[];
	/** System requirements. */
	requires?: Record<string, string>;
}

/** A registry catalog fetched from GitHub. */
export interface RegistryCatalog {
	/** Schema version. */
	version: number;
	/** Source identifier ("official" or "community"). */
	source: string;
	/** Plugin entries. */
	plugins: RegistryEntry[];
}

/** A locked plugin version in plugins.lock.json. */
export interface PluginLockEntry {
	/** Plugin name. */
	name: string;
	/** Installed version. */
	version: string;
	/** GitHub repo source. */
	repo: string;
	/** SHA-256 hash of the installed archive. */
	sha256: string;
	/** Installation timestamp (ISO 8601). */
	installedAt: string;
}

/** Progress event during plugin installation. */
export interface PluginInstallProgress {
	/** Current phase. */
	phase: "downloading" | "extracting" | "validating" | "complete" | "error";
	/** Progress percentage (0-100). */
	percent: number;
	/** Human-readable message. */
	message: string;
}

/** Available update for an installed plugin. */
export interface PluginUpdate {
	/** Plugin name. */
	name: string;
	/** Currently installed version. */
	currentVersion: string;
	/** Latest available version. */
	latestVersion: string;
	/** GitHub repo source. */
	repo: string;
}

/** A discovered plugin from scanning the plugins/ directory. */
export interface DiscoveredPlugin {
	/** Plugin name from manifest. */
	name: string;
	/** Plugin version. */
	version: string;
	/** Display name. */
	displayName?: string;
	/** Description. */
	description?: string;
	/** Filesystem path to the plugin directory. */
	path: string;
	/** Whether this plugin is from a lock file (installed) or local. */
	source: "installed" | "local";
}

// ---------------------------------------------------------------------------
// Hook Generation Results (returned by Tauri commands)
// ---------------------------------------------------------------------------

/** Result of regenerating hook dispatcher scripts. */
export interface HookGenerationResult {
	/** Number of dispatcher scripts written. */
	dispatchers_written: number;
	/** Events that have dispatchers. */
	events: string[];
	/** Hook keys that were included (format: "plugin:hook_key"). */
	hooks: string[];
}
