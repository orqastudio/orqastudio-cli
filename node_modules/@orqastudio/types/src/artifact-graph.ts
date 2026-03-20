/**
 * TypeScript mirrors of the Rust types in `src-tauri/src/domain/artifact_graph.rs`.
 *
 * These types flow across the Tauri IPC boundary and must stay in sync with
 * the Rust structs. The Rust side serialises with serde, so field names use
 * snake_case (matching the Rust struct fields directly).
 */

/** A single artifact node in the bidirectional graph. */
export interface ArtifactNode {
    /** Frontmatter `id` field (e.g. "EPIC-048"). */
    id: string;
    /** Source project name in organisation mode, or null for single-project mode. */
    project?: string | null;
    /** Relative path from the project root (e.g. ".orqa/delivery/epics/EPIC-048.md"). */
    path: string;
    /** Inferred category string (e.g. "epic", "task", "milestone", "idea", "decision"). */
    artifact_type: string;
    /** Frontmatter `title` field, or a humanized fallback from the filename. */
    title: string;
    /** Frontmatter `description` field. */
    description: string | null;
    /** Frontmatter `status` field. */
    status: string | null;
    /** Frontmatter `priority` field (e.g. "P1", "P2", "P3"). */
    priority: string | null;
    /** Full YAML frontmatter parsed into a generic JSON object. */
    frontmatter: Record<string, unknown>;
    /** Forward references declared in this node's frontmatter. */
    references_out: ArtifactRef[];
    /** Backlinks computed from other nodes' `references_out` during graph construction. */
    references_in: ArtifactRef[];
}

/** A directed reference from one artifact to another. */
export interface ArtifactRef {
    /** The artifact ID that is referenced (the link target). */
    target_id: string;
    /** Name of the frontmatter field that contains this reference. */
    field: string;
    /** ID of the artifact that declares this reference (the link source). */
    source_id: string;
    /** Semantic relationship type (e.g. "enforced-by", "grounded"). Only set for refs from the relationships array. */
    relationship_type: string | null;
}

/** Summary statistics about the artifact graph. */
export interface GraphStats {
    /** Total number of nodes (artifacts with an `id` field). */
    node_count: number;
    /** Total number of directed edges (sum of all `references_out` lengths). */
    edge_count: number;
    /** Nodes that have no `references_out` and no `references_in`. */
    orphan_count: number;
    /** References whose `target_id` does not exist in the graph. */
    broken_ref_count: number;
}

/**
 * All artifact type strings that the Rust backend can infer from directory paths.
 * Mirrors the `infer_artifact_type` function in `artifact_graph.rs`.
 */
export const ARTIFACT_TYPES = [
    "epic",
    "task",
    "milestone",
    "idea",
    "decision",
    "research",
    "lesson",
    "rule",
    "agent",
    "skill",
    "hook",
    "pillar",
    "doc",
] as const;

export type ArtifactGraphType = (typeof ARTIFACT_TYPES)[number];

/**
 * The 12 canonical artifact statuses.
 *
 * Projects define these in `project.json` with labels, icons, and auto-transition
 * rules. This type constrains the valid status values.
 */
export type CanonicalStatus =
    | "captured"
    | "exploring"
    | "ready"
    | "prioritised"
    | "active"
    | "hold"
    | "blocked"
    | "review"
    | "completed"
    | "surpassed"
    | "archived"
    | "recurring";

/** Alias for CanonicalStatus — used by the frontend. */
export type ArtifactStatus = CanonicalStatus;

/** Category of integrity issue found in the artifact graph. */
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
    | "InvalidStatus"
    | "BodyTextRefWithoutRelationship"
    | "ParentChildInconsistency"
    | "DeliveryPathMismatch";

/** Severity of an integrity finding. */
export type IntegritySeverity = "Error" | "Warning";

/** A single integrity finding from the graph. */
export interface IntegrityCheck {
    category: IntegrityCategory;
    severity: IntegritySeverity;
    artifact_id: string;
    message: string;
    auto_fixable: boolean;
    fix_description: string | null;
}

/** A fix that was applied to resolve an integrity issue. */
export interface AppliedFix {
    artifact_id: string;
    description: string;
    file_path: string;
}

/** A status transition proposed by the backend transition engine. */
export interface ProposedTransition {
    /** Artifact identifier, e.g. `"EPIC-048"`. */
    artifact_id: string;
    /** Relative path from the project root, e.g. `".orqa/delivery/epics/EPIC-048.md"`. */
    artifact_path: string;
    /** Current `status` frontmatter value. */
    current_status: string;
    /** Status value to transition to. */
    proposed_status: string;
    /** Human-readable explanation of why this transition is proposed. */
    reason: string;
    /** When `true` the backend already applied this transition automatically. */
    auto_apply: boolean;
}

/** A point-in-time snapshot of graph health metrics. */
export interface HealthSnapshot {
    id: number;
    project_id: number;
    node_count: number;
    edge_count: number;
    orphan_count: number;
    broken_ref_count: number;
    error_count: number;
    warning_count: number;
    created_at: string;
}
