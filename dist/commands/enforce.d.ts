/**
 * Enforcement command — the single command for all validation and enforcement.
 *
 * Replaces the old `orqa validate`. Runs the Rust validator for graph integrity
 * and schema checks, produces enforcement events, and supports response logging.
 *
 * orqa enforce [path]                   Run ALL checks on all artifacts
 * orqa enforce --mechanism json-schema  Run specific mechanism only
 * orqa enforce --rule RULE-xxx          Run all mechanisms for one rule
 * orqa enforce --file path/to/file.md   Run all mechanisms for one file
 * orqa enforce --report                 Enforcement coverage report
 * orqa enforce --fix                    Auto-fix fixable errors
 * orqa enforce --json                   JSON output
 * orqa enforce schema                   Validate project.json and plugin manifests
 * orqa enforce response --event-id X --action fixed --detail "..."
 */
export declare function runEnforceCommand(args: string[]): Promise<void>;
//# sourceMappingURL=enforce.d.ts.map