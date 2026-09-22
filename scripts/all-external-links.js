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

	// vault-specific frontmatter keys — see "Note property key" workflow config, blank by default
	const propParentKey = $.getenv("property_parent") || "";
	const propCategoryKey = $.getenv("property_category") || "";
	const propTypeKey = $.getenv("property_type") || "";

	// relativePath -> {parent, category, type}, sourced from metadata-extractor's export
	/** @type {Record<string, {parent: string, category: string, type: string}>} */
	const frontmatterByPath = {};
	try {
		const metaRaw = app.doShellScript(
			`cat "${vaultPath}/.obsidian/plugins/metadata-extractor/metadata.json"`,
		);
		for (const entry of JSON.parse(metaRaw)) {
			const fm = entry.frontmatter || {};
			frontmatterByPath[entry.relativePath] = {
				parent: cleanValue(fm[propParentKey]),
				category: cleanValue(fm[propCategoryKey]),
				type: cleanValue(fm[propTypeKey]),
			};
		}
	} catch (_error) {
		// metadata.json missing/stale (e.g. Obsidian not yet opened) — fall back silently
	}

	/** @type AlfredItem[] */
	const externalLinks = app
		// PERF considered `rg`, but `grep` alone is actually surprisingly fast
		// already, making `grep` a better choice since it does not add a dependency
		.doShellScript(`cd "${vaultPath}" && grep "\\[[^[]*?\\]\\(http[^)]*\\)" \
		--include=\\*.md --recursive --line-number --only-matching --extended-regexp .`)
		.split("\r")
		.map((line) => {
			const [filename, lnum, ...mdLink] = line.split(":");
			const [_, title, url] = mdLink.join(":").match(/\[([^[]*)\]\((.*)\)/);

			const relativePath = filename.replace(/^\.\//, "");
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
					cmd: { arg: filename + ":" + lnum },
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
