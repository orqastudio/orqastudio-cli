export interface Artifact {
	id: number;
	project_id: number;
	artifact_type: ArtifactType;
	rel_path: string;
	name: string;
	description: string | null;
	content: string;
	file_hash: string | null;
	file_size: number | null;
	file_modified_at: string | null;
	compliance_status: ComplianceStatus;
	relationships: ArtifactRelationship[] | null;
	metadata: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
}

export interface ArtifactSummary {
	id: number;
	artifact_type: ArtifactType;
	rel_path: string;
	name: string;
	description: string | null;
	compliance_status: ComplianceStatus;
	file_modified_at: string | null;
}

export type ArtifactType = "agent" | "rule" | "skill" | "hook" | "doc";
export type ComplianceStatus = "compliant" | "non_compliant" | "unknown" | "error";

export interface ArtifactRelationship {
	type: "references" | "extends" | "depends_on";
	target: string;
}

/** A node in the documentation tree returned by doc_tree_scan. */
export interface DocNode {
	/** Display name: filename without .md, hyphens replaced with spaces, title-cased. */
	label: string;
	/** Relative path from docs/ without .md extension (e.g. "product/vision"). Null for directories. */
	path: string | null;
	/** Child nodes for directories. Null for leaf files. */
	children: DocNode[] | null;
	/** Optional short description shown below the label for flat-list items. */
	description?: string | null;
}
