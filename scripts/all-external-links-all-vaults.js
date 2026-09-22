#!/usr/bin/env osascript -l JavaScript
ObjC.import("stdlib");
const app = Application.currentApplication();
app.includeStandardAdditions = true;

/** @param {string} str */
function alfredMatcher(str) {
	const clean = str.replace(/[^\w\s]+/g, " ");
	return [clean, str].join(" ") + " ";
}

/** Flatten a frontmatter value (wikilink, array, quoted string) to plain text. */
function cleanValue(value) {
	if (value === undefined || value === null) return "";
	if (Array.isArray(value)) return value.map(cleanValue).join(" ");
	return String(value).replace(/\[\[|\]\]/g, "").replace(/"/g, "").trim();
}

/** @param {string} str */
function titleCase(str) {
	return str.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

//──────────────────────────────────────────────────────────────────────────────

// biome-ignore lint/correctness/noUnusedVariables: Alfred run
function run() {
	const vaultPath = $.getenv("vault_path");
	const parentPath = `${vaultPath}/..`;

	// Vaults oea searches: the main vault, plus sibling folder names (relative
	// to vault_path's parent) from the "Additional vault folders" workflow
	// configuration — comma-separated, e.g. "Recipes.sync, Work.sync".
	const mainVaultFolder = vaultPath.replace(/\/$/, "").replace(/.*\//, "");
	const extraVaultFolders = ($.getenv("oa_vault_folders") || "")
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean);
	const VAULT_FOLDERS = [mainVaultFolder, ...extraVaultFolders];

	// vault-specific frontmatter keys — see "Note property key" workflow config, blank by default
	const propParentKey = $.getenv("property_parent") || "";
	const propCategoryKey = $.getenv("property_category") || "";
	const propTypeKey = $.getenv("property_type") || "";

	// "vaultFolder/relative/path.md" -> {parent, category, type}, merged across
	// each allow-listed vault's own metadata-extractor export
	/** @type {Record<string, {parent: string, category: string, type: string}>} */
	const frontmatterByPath = {};
	for (const vaultFolder of VAULT_FOLDERS) {
		try {
			const metaRaw = app.doShellScript(
				`cat "${parentPath}/${vaultFolder}/.obsidian/plugins/metadata-extractor/metadata.json"`,
			);
			for (const entry of JSON.parse(metaRaw)) {
				const fm = entry.frontmatter || {};
				frontmatterByPath[`${vaultFolder}/${entry.relativePath}`] = {
					parent: cleanValue(fm[propParentKey]),
					category: cleanValue(fm[propCategoryKey]),
					type: cleanValue(fm[propTypeKey]),
				};
			}
		} catch (_error) {
			// this vault's metadata.json is missing/unreadable — its links still show, minus properties
		}
	}

	const searchPaths = VAULT_FOLDERS.map((v) => `"${v}"`).join(" ");

	/** @type AlfredItem[] */
	const externalLinks = app
		// PERF considered `rg`, but `grep` alone is actually surprisingly fast
		// already, making `grep` a better choice since it does not add a dependency
		.doShellScript(`cd "${parentPath}" && grep "\\[[^[]*?\\]\\(http[^)]*\\)" \
		--include=\\*.md --recursive --line-number --only-matching --extended-regexp ${searchPaths}`)
		.split("\r")
		.map((line) => {
			const [filename, lnum, ...mdLink] = line.split(":");
			const [_, title, url] = mdLink.join(":").match(/\[([^[]*)\]\((.*)\)/);

			const relativePath = filename.replace(/^\.\//, "");
			const slashIdx = relativePath.indexOf("/");
			const vaultFolder = relativePath.slice(0, slashIdx);
			const pathInVault = relativePath.slice(slashIdx + 1);

			const fm = frontmatterByPath[relativePath] || { parent: "", category: "", type: "" };
			const bits = [fm.parent, fm.category, fm.type].filter(Boolean).map(titleCase);
			bits.push(filename.slice(0, 30));

			return {
				title: title,
				subtitle: `${bits.join("  ·  ")}   ${url.slice(8)}`,
				arg: url,
				match:
					alfredMatcher(title) +
					alfredMatcher(filename) +
					alfredMatcher(url) +
					alfredMatcher(fm.parent) +
					alfredMatcher(fm.category) +
					alfredMatcher(fm.type),
				uid: line,
				mods: {
					// vaultFolder is prefixed (open-note.js splits on "|") since results
					// here aren't rooted at vault_path like oe's are.
					cmd: { arg: `${vaultFolder}|${pathInVault}:${lnum}` },
				},
			};
		});

	return JSON.stringify({
		items: externalLinks,
		cache: {
			seconds: 300,
			loosereload: true,
		},
	});
}
