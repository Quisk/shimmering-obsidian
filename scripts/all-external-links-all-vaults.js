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

	/** Resolve an "Additional vault folders" entry to its label and absolute
	 * root. A bare name (e.g. "Recipes.sync") is treated as a sibling of
	 * vault_path; an absolute or "~"-prefixed path is used as-is, so vaults
	 * living anywhere on disk can be added, not just siblings. */
	function resolveVaultEntry(entry) {
		const isPath = entry.startsWith("/") || entry.startsWith("~");
		const root = isPath
			? entry.replace(/^~(?=$|\/)/, $.getenv("HOME")).replace(/\/$/, "")
			: `${parentPath}/${entry}`;
		const label = root.replace(/\/$/, "").replace(/.*\//, "");
		return { label, root };
	}

	// Vaults oea searches: the main vault, plus any additional vaults from the
	// "Additional vault folders" workflow configuration — comma-separated,
	// e.g. "Recipes.sync, Work.sync" (siblings) or "~/Vaults/Work" (any path).
	const mainVaultFolder = vaultPath.replace(/\/$/, "").replace(/.*\//, "");
	const extraVaults = ($.getenv("oa_vault_folders") || "")
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean)
		.map(resolveVaultEntry);
	const VAULTS = [{ label: mainVaultFolder, root: vaultPath }, ...extraVaults];

	// vault-specific frontmatter keys — see "Note properties to index" config, blank by default
	const notePropertyKeys = ($.getenv("note_properties") || "")
		.split(",")
		.map((k) => k.trim())
		.filter(Boolean);

	// "vault.label/relative/path.md" -> cleaned note-property values, in
	// configured order, merged across each vault's own metadata-extractor export
	/** @type {Record<string, string[]>} */
	const frontmatterByPath = {};
	for (const vault of VAULTS) {
		try {
			const metaRaw = app.doShellScript(
				`cat "${vault.root}/.obsidian/plugins/metadata-extractor/metadata.json"`,
			);
			for (const entry of JSON.parse(metaRaw)) {
				const fm = entry.frontmatter || {};
				frontmatterByPath[`${vault.label}/${entry.relativePath}`] = notePropertyKeys.map((k) =>
					cleanValue(fm[k]),
				);
			}
		} catch (_error) {
			// this vault's metadata.json is missing/unreadable — its links still show, minus properties
		}
	}

	// PERF considered `rg`, but `grep` alone is actually surprisingly fast
	// already, making `grep` a better choice since it does not add a dependency
	/** @type AlfredItem[] */
	const externalLinks = [];
	for (const vault of VAULTS) {
		let rawLines;
		try {
			rawLines = app
				.doShellScript(`cd "${vault.root}" && grep "\\[[^[]*?\\]\\(http[^)]*\\)" \
				--include=\\*.md --recursive --line-number --only-matching --extended-regexp .`)
				.split("\r");
		} catch (_error) {
			continue; // no external links in this vault, or vault unreachable
		}

		for (const line of rawLines) {
			const [filename, lnum, ...mdLink] = line.split(":");
			const [_, title, url] = mdLink.join(":").match(/\[([^[]*)\]\((.*)\)/);

			const pathInVault = filename.replace(/^\.\//, "");
			const relativePath = `${vault.label}/${pathInVault}`;
			const propValues = frontmatterByPath[relativePath] || [];
			const bits = propValues.filter(Boolean).map(titleCase);
			bits.push(filename.slice(0, 30));

			externalLinks.push({
				title: title,
				subtitle: `${bits.join("  ·  ")}   ${url.slice(8)}`,
				arg: url,
				match:
					alfredMatcher(title) +
					alfredMatcher(filename) +
					alfredMatcher(url) +
					propValues.map(alfredMatcher).join(""),
				uid: `${vault.label}:${line}`,
				mods: {
					// vault.label is prefixed (open-note.js splits on "|") since results
					// here aren't rooted at vault_path like oe's are.
					cmd: { arg: `${vault.label}|${pathInVault}:${lnum}` },
				},
			});
		}
	}

	return JSON.stringify({
		items: externalLinks,
		cache: {
			seconds: 300,
			loosereload: true,
		},
	});
}
