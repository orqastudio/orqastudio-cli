/**
 * Install commands — dev environment bootstrapping.
 *
 * orqa install              Full setup (prereqs + submodules + deps + link + verify)
 * orqa install prereqs      Check/install prerequisites (git, node, rust, cargo, npm)
 * orqa install submodules   Init and update git submodules
 * orqa install deps         Install package dependencies (npm install + cargo fetch)
 * orqa install link         Build libs and npm link into app
 * orqa install verify       Run all verification checks
 */
export declare function runInstallCommand(args: string[]): Promise<void>;
//# sourceMappingURL=install.d.ts.map