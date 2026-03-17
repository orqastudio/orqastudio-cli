/**
 * README auditor — check README files across all repos for canonical structure.
 *
 * Every repo should have a README.md with at minimum:
 * - Title (# heading matching the package display name)
 * - Description paragraph
 * - Installation section (for publishable packages)
 * - Usage section
 * - License section
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface ReadmeSection {
	name: string;
	required: boolean;
	pattern: RegExp;
}

export const REQUIRED_SECTIONS: ReadmeSection[] = [
	{ name: "title", required: true, pattern: /^# .+/m },
	{ name: "description", required: true, pattern: /^[A-Z].{20,}/m },
	{ name: "installation", required: false, pattern: /^##\s+install/im },
	{ name: "usage", required: false, pattern: /^##\s+usage/im },
	{ name: "license", required: true, pattern: /^##\s+licen[sc]e/im },
];

export interface ReadmeAuditResult {
	dir: string;
	name: string;
	status: "ok" | "missing" | "incomplete";
	missingSections: string[];
}

/**
 * Audit README.md files across all directories in the dev environment.
 */
export function auditReadmes(projectRoot: string): ReadmeAuditResult[] {
	const results: ReadmeAuditResult[] = [];

	// App
	results.push(checkReadme(path.join(projectRoot, "app"), "app"));

	// Scan category directories
	for (const category of ["libs", "plugins", "connectors", "tools", "registry"]) {
		const dir = path.join(projectRoot, category);
		if (!fs.existsSync(dir)) continue;

		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
			results.push(checkReadme(path.join(dir, entry.name), `${category}/${entry.name}`));
		}
	}

	// Templates
	const templatesDir = path.join(projectRoot, "templates");
	if (fs.existsSync(templatesDir)) {
		results.push(checkReadme(templatesDir, "templates"));
	}

	return results;
}

function checkReadme(dir: string, name: string): ReadmeAuditResult {
	const readmePath = path.join(dir, "README.md");

	if (!fs.existsSync(readmePath)) {
		return {
			dir,
			name,
			status: "missing",
			missingSections: REQUIRED_SECTIONS.filter((s) => s.required).map((s) => s.name),
		};
	}

	const content = fs.readFileSync(readmePath, "utf-8");
	const missing: string[] = [];

	for (const section of REQUIRED_SECTIONS) {
		if (section.required && !section.pattern.test(content)) {
			missing.push(section.name);
		}
	}

	return {
		dir,
		name,
		status: missing.length > 0 ? "incomplete" : "ok",
		missingSections: missing,
	};
}

/**
 * Generate a canonical README template for a given package type.
 */
export function generateReadmeTemplate(opts: {
	name: string;
	displayName: string;
	description: string;
	category: "lib" | "plugin" | "connector" | "tool";
	license: string;
}): string {
	const installSection = opts.category !== "tool"
		? `\n## Installation\n\n\`\`\`bash\nnpm install ${opts.name}\n\`\`\`\n`
		: "";

	return `# ${opts.displayName}

${opts.description}
${installSection}
## Usage

<!-- Add usage examples here -->

## Development

\`\`\`bash
npm install
npm run build
npm test
\`\`\`

## License

${opts.license}
`;
}
