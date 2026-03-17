/**
 * Run all integrity checks against an artifact graph.
 *
 * Checks receive a CheckContext built from platform config + project.json,
 * so they never hardcode artifact types or relationship keys.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactGraph, IntegrityFinding, CheckContext } from "./types.js";
import { PLATFORM_CONFIG, buildInverseMap } from "./types.js";
import { checkBrokenLinks } from "./checks/broken-links.js";
import { checkMissingInverses } from "./checks/missing-inverses.js";
import { checkDependencyViolations, checkCircularDependencies } from "./checks/dependency-violations.js";
import { checkSupersessionSymmetry } from "./checks/supersession.js";
import { checkPlanningPlacement } from "./checks/planning.js";
import { checkIdeaPromotionValidity, checkIdeaDeliveryTracking, checkResearchGaps } from "./checks/ideas.js";
import { checkMilestoneGate } from "./checks/milestones.js";
import { checkBodyTemplates } from "./checks/body-templates.js";
import { checkPriorityWithoutJustification } from "./checks/priority.js";
import { checkRelationshipConstraints } from "./checks/relationship-constraints.js";

/** A check function that accepts graph + context. */
type CheckFn = (graph: ArtifactGraph, ctx: CheckContext) => IntegrityFinding[];

/** All available check functions. */
export const ALL_CHECKS: CheckFn[] = [
  checkBrokenLinks,
  checkMissingInverses,
  checkRelationshipConstraints,
  checkDependencyViolations,
  checkCircularDependencies,
  checkSupersessionSymmetry,
  checkPlanningPlacement,
  checkIdeaPromotionValidity,
  checkIdeaDeliveryTracking,
  checkResearchGaps,
  checkMilestoneGate,
  checkBodyTemplates,
  checkPriorityWithoutJustification,
];

/**
 * Build a CheckContext by merging platform config with project.json.
 *
 * The merged context is the single source of truth for all checks —
 * no check should hardcode any artifact type or relationship key.
 */
export function buildCheckContext(projectRoot: string): CheckContext {
  // Start with platform relationships
  const allRelationships = [...PLATFORM_CONFIG.relationships];

  // Load project.json for project-level extensions
  let deliveryTypes: CheckContext["deliveryTypes"] = [];
  try {
    const projectJsonPath = join(projectRoot, ".orqa", "project.json");
    const raw = readFileSync(projectJsonPath, "utf-8");
    const projectJson = JSON.parse(raw) as Record<string, unknown>;

    // Merge project relationships
    const projRels = projectJson["relationships"];
    if (Array.isArray(projRels)) {
      for (const rel of projRels) {
        const r = rel as Record<string, unknown>;
        if (typeof r["key"] === "string" && typeof r["inverse"] === "string") {
          allRelationships.push({
            key: r["key"] as string,
            inverse: r["inverse"] as string,
            label: (r["label"] as string) ?? r["key"] as string,
            inverseLabel: (r["inverse_label"] as string) ?? r["inverse"] as string,
            from: [],
            to: [],
            description: "",
          });
        }
      }
    }

    // Load delivery types
    const delivery = projectJson["delivery"] as Record<string, unknown> | undefined;
    if (delivery && Array.isArray(delivery["types"])) {
      deliveryTypes = (delivery["types"] as Array<Record<string, unknown>>).map((dt) => ({
        key: dt["key"] as string,
        parent: dt["parent"]
          ? {
              type: (dt["parent"] as Record<string, unknown>)["type"] as string,
              relationship: (dt["parent"] as Record<string, unknown>)["relationship"] as string,
            }
          : undefined,
      }));
    }
  } catch {
    // No project.json — use platform defaults only
  }

  return {
    inverseMap: buildInverseMap(allRelationships),
    semantics: PLATFORM_CONFIG.semantics,
    deliveryTypes,
    relationships: allRelationships,
  };
}

/** Run all integrity checks and return findings. */
export function runChecks(graph: ArtifactGraph, ctx: CheckContext): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  for (const check of ALL_CHECKS) {
    findings.push(...check(graph, ctx));
  }
  return findings;
}

/** Summary of check results. */
export interface CheckSummary {
  totalFindings: number;
  errors: number;
  warnings: number;
  byCategory: Map<string, number>;
  findings: IntegrityFinding[];
}

/** Run all checks and return a summary. */
export function runChecksWithSummary(graph: ArtifactGraph, ctx: CheckContext): CheckSummary {
  const findings = runChecks(graph, ctx);
  const byCategory = new Map<string, number>();

  let errors = 0;
  let warnings = 0;

  for (const f of findings) {
    if (f.severity === "error") errors++;
    else warnings++;
    byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);
  }

  return {
    totalFindings: findings.length,
    errors,
    warnings,
    byCategory,
    findings,
  };
}
