/**
 * Core types for the OrqaStudio integrity checker.
 *
 * ArtifactNode, ArtifactRef, and ArtifactGraph use camelCase field names
 * (the integrity validator's convention). This differs from @orqastudio/types
 * which uses snake_case to match Rust/Tauri IPC serialisation. The shapes are
 * intentionally local — the validator builds its own graph from disk, not from
 * IPC responses.
 *
 * INVERSE_MAP is imported from @orqastudio/types to keep a single source of truth.
 */

// Re-export from @orqastudio/types (single source of truth)
export { INVERSE_MAP, buildInverseMap, hasSemantic, keysForSemantic, PLATFORM_CONFIG, PLATFORM_SEMANTICS } from "@orqastudio/types";
export type { RelationshipType, PlatformConfig, RelationshipSemantic } from "@orqastudio/types";

/** Categories of integrity findings. */
export type IntegrityCategory =
  | "BrokenLink"
  | "MissingInverse"
  | "NullTarget"
  | "ResearchGap"
  | "PlanningPlacement"
  | "DependencyViolation"
  | "CircularDependency"
  | "SupersessionSymmetry"
  | "MilestoneGate"
  | "IdeaPromotionValidity"
  | "IdeaDeliveryTracking"
  | "DeprecatedField"
  | "StatusTransition"
  | "SchemaViolation"
  | "BareArtifactId"
  | "BodyTemplate"
  | "PriorityWithoutJustification"
  | "RelationshipConstraint";

/** Severity of a finding. */
export type IntegritySeverity = "error" | "warning";

/** A single integrity finding. */
export interface IntegrityFinding {
  category: IntegrityCategory;
  severity: IntegritySeverity;
  artifactId: string;
  message: string;
  autoFixable: boolean;
  fixDescription?: string;
}

/**
 * A reference from one artifact to another.
 *
 * Note: uses camelCase (sourceId, targetId, relationshipType) whereas
 * @orqastudio/types ArtifactRef uses snake_case (source_id, target_id,
 * relationship_type). This is intentional — the validator operates on its
 * own graph built from disk, not from Tauri IPC responses.
 */
export interface ArtifactRef {
  sourceId: string;
  targetId: string;
  field: string;
  relationshipType?: string;
}

/** A section definition from a schema's bodyTemplate. */
export interface BodyTemplateSection {
  heading: string;
  required: boolean;
}

/** A schema's bodyTemplate definition. */
export interface BodyTemplate {
  sections: BodyTemplateSection[];
}

/** A node in the artifact graph. */
export interface ArtifactNode {
  id: string;
  path: string;
  artifactType: string;
  title: string;
  status?: string;
  frontmatter: Record<string, unknown>;
  body: string;
  referencesOut: ArtifactRef[];
  referencesIn: ArtifactRef[];
}

/** The full artifact graph. */
export interface ArtifactGraph {
  nodes: Map<string, ArtifactNode>;
  /** Body templates keyed by artifact type (from schema.json files). */
  bodyTemplates: Map<string, BodyTemplate>;
}

/** Configuration for the integrity checker. */
export interface IntegrityConfig {
  /** Path to the project root (contains .orqa/). */
  projectRoot: string;
  /** Override path to project.json. Defaults to .orqa/project.json. */
  projectJsonPath?: string;
  /** Only check files in this list (for staged-file mode). */
  stagedFiles?: string[];
}

/**
 * Context passed to each check function — provides schema-driven config
 * so checks never need to hardcode artifact types or relationship keys.
 */
export interface CheckContext {
  /** Merged inverse map (platform + project + plugin relationships). */
  inverseMap: ReadonlyMap<string, string>;
  /** Semantic categories from platform config. */
  semantics: Record<string, { description: string; keys: string[] }>;
  /** Delivery type hierarchy from project.json (if available). */
  deliveryTypes: Array<{ key: string; parent?: { type: string; relationship: string } }>;
  /** All known relationship definitions (platform + project). */
  relationships: ReadonlyArray<{ key: string; inverse: string; semantic?: string; from?: string[]; to?: string[] }>;
}
