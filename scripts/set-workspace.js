#!/usr/bin/env osascript -l JavaScript
ObjC.import("stdlib");
ObjC.import("Foundation");
const app = Application.currentApplication();
app.includeStandardAdditions = true;

/** @type {AlfredRun} */
// biome-ignore lint/correctness/noUnusedVariables: Alfred run
function run(argv) {
	// get target spellcheck status
	// owa passes "<vaultFolder>|<workspace>"; ow passes just "<workspace>"
	let workspaceName = argv[0];
	let vaultName = $.getenv("vault_path").replace(/\/$/, "").replace(/.*\//, "");
	const sep = workspaceName.indexOf("|");
	if (sep !== -1) {
		vaultName = workspaceName.slice(0, sep);
		workspaceName = workspaceName.slice(sep + 1);
	}
	const vaultNameEnc = encodeURIComponent(vaultName);

	if (workspaceName === "_save-workspace") {
		app.openLocation(`obsidian://advanced-uri?vault=${vaultNameEnc}&saveworkspace=true`);
		return;
	}
	if (workspaceName === "_manage-workspace") {
		app.openLocation(
			`obsidian://advanced-uri?vault=${vaultNameEnc}&commandid=workspaces%253Aopen-modal`,
		);
		return;
	}

	const workspaceLoadURI = `obsidian://advanced-uri?vault=${vaultNameEnc}&workspace=${encodeURIComponent(
		workspaceName,
	)}`;
	app.openLocation(workspaceLoadURI);
}
