#!/usr/bin/env osascript -l JavaScript
ObjC.import("stdlib");
ObjC.import("Foundation");
const app = Application.currentApplication();
app.includeStandardAdditions = true;
//──────────────────────────────────────────────────────────────────────────────

/** @param {string} path */
function readFile(path) {
	const data = $.NSFileManager.defaultManager.contentsAtPath(path);
	const str = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
	return ObjC.unwrap(str);
}

const fileExists = (/** @type {string} */ filePath) => Application("Finder").exists(Path(filePath));

//──────────────────────────────────────────────────────────────────────────────
// Multi-vault workspace switcher: lists the saved workspaces of the main vault
// plus every vault in "Additional vault folders" (the same list oa/oea use).
// Each arg is "<vaultFolder>|<workspace>" so set-workspace.js targets the
// right vault.

/** @type {AlfredRun} */
// biome-ignore lint/correctness/noUnusedVariables: Alfred run
function run() {
	const vaultPath = $.getenv("vault_path").replace(/\/$/, "");
	const configFolder = $.getenv("config_folder");
	const parentPath = `${vaultPath}/..`;

	/** Same entry rules as o_search-all-vaults.js: a bare name is a sibling of
	 * vault_path; an absolute or "~"-prefixed path is used as-is. */
	function resolveVaultEntry(entry) {
		const isPath = entry.startsWith("/") || entry.startsWith("~");
		const root = isPath
			? entry.replace(/^~(?=$|\/)/, $.getenv("HOME")).replace(/\/$/, "")
			: `${parentPath}/${entry}`;
		const label = root.replace(/.*\//, "");
		return { label, root, config: ".obsidian" };
	}

	const mainVaultFolder = vaultPath.replace(/.*\//, "");
	const extraVaults = ($.getenv("oa_vault_folders") || "")
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean)
		.map(resolveVaultEntry);
	const VAULTS = [
		{ label: mainVaultFolder, root: vaultPath, config: configFolder },
		...extraVaults,
	];

	/** @type {AlfredItem[]} */
	const workspaceItems = [];
	/** @type {AlfredItem[]} */
	const manageItems = [];

	for (const vault of VAULTS) {
		const workspaceFile = `${vault.root}/${vault.config}/workspaces.json`;
		// vault missing or Workspaces core plugin never used — skip, don't fail
		if (!fileExists(workspaceFile)) continue;
		const workspaceJSON = JSON.parse(readFile(workspaceFile));
		const active = workspaceJSON.active;

		for (const workspace of Object.keys(workspaceJSON.workspaces || {})) {
			let iconpath = "icons/workspace.png";
			if (workspace.toLowerCase().includes("longform")) iconpath = "icons/writing.png";
			const arg = `${vault.label}|${workspace}`;
			const isActive = workspace === active;

			workspaceItems.push({
				title: `Load "${workspace}"`,
				subtitle: `▸ ${vault.label}${isActive ? "  ·  active" : ""}`,
				match: `${workspace.replaceAll("-", " ")} ${workspace} ${vault.label}`,
				arg: arg,
				uid: arg,
				icon: { path: iconpath },
			});
		}

		if (active) {
			manageItems.push({
				title: `Save "${active}"`,
				subtitle: `▸ ${vault.label}`,
				match: `save ${active} ${vault.label}`,
				arg: `${vault.label}|_save-workspace`,
				icon: { path: "icons/save-workspace.png" },
				// no UID so these stay below the workspaces
			});
		}
		manageItems.push({
			title: "Manage Workspaces",
			subtitle: `▸ ${vault.label}`,
			match: `manage ${vault.label}`,
			arg: `${vault.label}|_manage-workspace`,
			icon: { path: "icons/settings.png" },
		});
	}

	if (workspaceItems.length === 0 && manageItems.length === 0) {
		return JSON.stringify({
			items: [
				{
					title: "No workspaces found.",
					subtitle:
						'Workspaces Core Plugin potentially not enabled, or check "Additional vault folders".',
					valid: false,
				},
			],
		});
	}

	return JSON.stringify({ items: [...workspaceItems, ...manageItems] });
}
