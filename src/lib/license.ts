/**
 * License auditor — check LICENSE files across all repos in a dev environment.
 *
 * Convention:
 * - Core app + libraries: BSL-1.1 (Business Source License, converts to Apache 2.0 after 4 years)
 * - Plugins: BSL-1.1 (same as core)
 * - Templates: BSL-1.1
 * - Connectors: Apache-2.0 or MIT (third-party tools may have requirements)
 * - Tools: MIT
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface LicensePolicy {
	category: string;
	expectedLicense: string;
	description: string;
}

export const DEFAULT_LICENSE_POLICY: LicensePolicy[] = [
	{ category: "app", expectedLicense: "BSL-1.1", description: "Core app — BSL-1.1" },
	{ category: "libs", expectedLicense: "BSL-1.1", description: "Libraries — BSL-1.1" },
	{ category: "plugins", expectedLicense: "BSL-1.1", description: "Plugins — BSL-1.1" },
	{ category: "connectors", expectedLicense: "Apache-2.0", description: "Connectors — Apache 2.0 (third-party compatibility)" },
	{ category: "templates", expectedLicense: "BSL-1.1", description: "Templates — BSL-1.1" },
	{ category: "tools", expectedLicense: "MIT", description: "Tools — MIT" },
	{ category: "registry", expectedLicense: "MIT", description: "Registries — MIT" },
];

export interface LicenseAuditResult {
	file: string;
	category: string;
	expected: string;
	found: string | null;
	status: "ok" | "missing" | "mismatch";
}

/**
 * Audit LICENSE files across all directories in the dev environment.
 */
export function auditLicenses(
	projectRoot: string,
	policy: LicensePolicy[] = DEFAULT_LICENSE_POLICY,
): LicenseAuditResult[] {
	const results: LicenseAuditResult[] = [];

	// App
	results.push(checkLicense(path.join(projectRoot, "app"), "app", policy));

	// Scan category directories
	for (const category of ["libs", "plugins", "connectors", "tools", "registry"]) {
		const dir = path.join(projectRoot, category);
		if (!fs.existsSync(dir)) continue;

		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
			results.push(checkLicense(path.join(dir, entry.name), category, policy));
		}
	}

	// Templates
	const templatesDir = path.join(projectRoot, "templates");
	if (fs.existsSync(templatesDir)) {
		results.push(checkLicense(templatesDir, "templates", policy));
	}

	return results;
}

function checkLicense(dir: string, category: string, policy: LicensePolicy[]): LicenseAuditResult {
	const policyEntry = policy.find((p) => p.category === category);
	const expected = policyEntry?.expectedLicense ?? "unknown";

	const licensePath = path.join(dir, "LICENSE");
	const licenseAltPath = path.join(dir, "LICENSE.md");

	const licenseFile = fs.existsSync(licensePath)
		? licensePath
		: fs.existsSync(licenseAltPath)
			? licenseAltPath
			: null;

	if (!licenseFile) {
		return { file: dir, category, expected, found: null, status: "missing" };
	}

	const content = fs.readFileSync(licenseFile, "utf-8");
	const detected = detectLicense(content);

	return {
		file: licenseFile,
		category,
		expected,
		found: detected,
		status: detected === expected ? "ok" : "mismatch",
	};
}

function detectLicense(content: string): string {
	const upper = content.toUpperCase();
	if (upper.includes("BUSINESS SOURCE LICENSE") || upper.includes("BSL")) return "BSL-1.1";
	if (upper.includes("APACHE LICENSE") && upper.includes("VERSION 2.0")) return "Apache-2.0";
	if (upper.includes("MIT LICENSE") || upper.includes("PERMISSION IS HEREBY GRANTED")) return "MIT";
	if (upper.includes("ISC LICENSE")) return "ISC";
	if (upper.includes("GNU GENERAL PUBLIC LICENSE")) return "GPL";
	return "unknown";
}
