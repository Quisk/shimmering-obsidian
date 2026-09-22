#!/usr/bin/env osascript -l JavaScript
ObjC.import("stdlib");
const app = Application.currentApplication();
app.includeStandardAdditions = true;
//───────────────────────────────────────────────────────────────────────────

/** @type {AlfredRun} */
// biome-ignore lint/correctness/noUnusedVariables: Alfred run
function run(argv) {
	let vaultPath = $.getenv("vault_path");
	const pasteInstead = $.getenv("paste_instead_of_copy") === "1";

	// import variables
	let raw = argv[0];

	// `oa` (multi-vault note search) prefixes the source vault's folder name
	// before a "|", since its results aren't rooted at vault_path like everyone
	// else's are.
	const pipeIdx = raw.indexOf("|");
	if (pipeIdx !== -1) {
		const vaultFolder = raw.slice(0, pipeIdx);
		raw = raw.slice(pipeIdx + 1);
		vaultPath = `${vaultPath}/../${vaultFolder}`;
	}
	const vaultNameEnc = encodeURIComponent(vaultPath.replace(/\/$/, "").replace(/.*\//, ""));

	let [relativePath, heading] = raw.split("#");
	const relativeEncodedPath = encodeURIComponent(relativePath);
	heading = heading ? encodeURIComponent(heading) : "";
	const linkType = $.getenv("link_type_to_copy");

	//───────────────────────────────────────────────────────────────────────────

	const filenameNoExt = relativePath
		.split("/")
		.pop()
		?.replace(/\.\w+$/, "") || "error: path not found";
	let toCopy;

	if (linkType === "Markdown Link" && heading) {
		const urlScheme = `obsidian://advanced-uri?vault=${vaultNameEnc}&filepath=${relativeEncodedPath}&heading=${heading}`;
		toCopy = `[${filenameNoExt}|${heading}](${urlScheme})`;
	} else if (linkType === "Markdown Link") {
		const urlScheme = `obsidian://open?vault=${vaultNameEnc}&file=${relativeEncodedPath}`;
		toCopy = `[${filenameNoExt}](${urlScheme})`;
	} else if (linkType === "Wikilink" && heading) {
		toCopy = `[[${filenameNoExt}#${heading}]]`;
	} else if (linkType === "Wikilink") {
		toCopy = `[[${filenameNoExt}]]`;
	} else if (linkType === "Obsidian URI" && heading) {
		toCopy = `obsidian://advanced-uri?vault=${vaultNameEnc}&filepath=${relativeEncodedPath}&heading=${heading}`;
	} else if (linkType === "Obsidian URI") {
		toCopy= `obsidian://open?vault=${vaultNameEnc}&file=${relativeEncodedPath}`;
	} else {
		toCopy = "error: link type not found";
	}

	app.setTheClipboardTo(toCopy);

	if (pasteInstead) {
		delay(0.1); // for wait clipboard to be updated
		Application("System Events").keystroke("v", { using: ["command down"] });
	} else {
		return toCopy; // notification only when copying
	}
}
