#!/usr/bin/env osascript -l JavaScript
ObjC.import("stdlib");
const app = Application.currentApplication();
app.includeStandardAdditions = true;
//──────────────────────────────────────────────────────────────────────────────

/** @param {string} path */
function readFile(path) {
	const data = $.NSFileManager.defaultManager.contentsAtPath(path);
	const str = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
	return ObjC.unwrap(str);
}

/** @param {string} filePath */
function parentFolder(filePath) {
	if (!filePath.includes("/")) return "/";
	return filePath.split("/").slice(0, -1).join("/");
}

/** @param {string} str */
function camelCaseMatch(str) {
	const subwords = str.replace(/[-_./]/g, " ");
	const fullword = str.replace(/[-_./]/g, "");
	const camelCaseSeparated = str.replace(/([A-Z])/g, " $1");
	return [subwords, camelCaseSeparated, fullword, str].join(" ") + " ";
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

const fileExists = (/** @type {string} */ filePath) => Application("Finder").exists(Path(filePath));

//──────────────────────────────────────────────────────────────────────────────
// Flat multi-vault note search: files, aliases, and headings only.
// Unlike o_search.js, this does not support folder browsing, canvases, or
// bookmark/recent-file boosting — kept deliberately simple since it spans
// multiple vaults' own workspace/starred/bookmarks state.

// biome-ignore lint/correctness/noUnusedVariables: Alfred run
function run() {
	const vaultPath = $.getenv("vault_path");
	const parentPath = `${vaultPath}/..`;

	// Vaults oa searches: the main vault, plus sibling folder names (relative
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

	const hLVLignore = $.getenv("h_lvl_ignore") || "";
	/** @type {boolean[]} */
	const headingIgnore = [];
	for (let i = 1; i < 7; i++) headingIgnore[i] = hLVLignore.includes(i.toString());

	/** @type AlfredItem[] */
	const resultsArr = [];

	for (const vaultFolder of VAULT_FOLDERS) {
		const vaultRoot = `${parentPath}/${vaultFolder}`;
		const vaultConfig = `${vaultRoot}/.obsidian`;
		const metadataJSON = `${vaultConfig}/plugins/metadata-extractor/metadata.json`;
		const excludeFilterJSON = `${vaultConfig}/app.json`;
		// vault missing/not exported yet — skip it, don't fail the whole search
		if (!fileExists(metadataJSON)) continue;

		const fileArray = JSON.parse(readFile(metadataJSON));
		const excludeFilter = fileExists(excludeFilterJSON)
			? JSON.parse(readFile(excludeFilterJSON)).userIgnoreFilters
			: [];

		/** @param {{relativePath: string}[]} items */
		function applyExcludeFilter(items) {
			if (!excludeFilter || excludeFilter.length === 0 || items.length === 0) return items;
			return items.filter((item) => {
				let include = true;
				for (const filter of excludeFilter) {
					const isRegexFilter = filter.startsWith("/");
					if (isRegexFilter && item.relativePath.includes(filter)) include = false;
					if (!isRegexFilter && item.relativePath.startsWith(filter)) include = false;
				}
				return include;
			});
		}

		for (const file of applyExcludeFilter(fileArray)) {
			const filename = file.fileName;
			const relativePath = file.relativePath;
			const absolutePath = `${vaultRoot}/${relativePath}`;
			const vaultArg = `${vaultFolder}|${relativePath}`;

			// note properties (parent / category / type), for both matching and subtitles
			const fm = file.frontmatter || {};
			const propBits = [fm[propParentKey], fm[propCategoryKey], fm[propTypeKey]]
				.map(cleanValue)
				.filter(Boolean)
				.map(titleCase);
			const propMatcher = [fm[propParentKey], fm[propCategoryKey], fm[propTypeKey]]
				.map(cleanValue)
				.filter(Boolean)
				.join(" ");
			const propPrefix = propBits.length ? `${propBits.join("  ·  ")}   ` : "";

			const tagMatcher = file.tags ? " #" + file.tags.join(" #") : "";
			const baseSubtitle = `▸ ${vaultFolder}/${parentFolder(relativePath)}`;

			// Notes (file names)
			resultsArr.push({
				title: filename,
				match:
					camelCaseMatch(filename) +
					tagMatcher +
					" filename name title " +
					vaultFolder +
					" " +
					propMatcher,
				subtitle: propPrefix + baseSubtitle,
				arg: vaultArg,
				quicklookurl: absolutePath,
				type: "file:skipcheck",
				uid: vaultArg,
				icon: { path: "icons/note.png" },
				mods: {
					alt: { arg: vaultArg },
					ctrl: { arg: vaultArg },
				},
			});

			// Aliases
			if (file.aliases) {
				for (const alias of file.aliases) {
					resultsArr.push({
						title: alias,
						match: camelCaseMatch(alias) + "alias " + vaultFolder + " " + propMatcher,
						subtitle: propPrefix + "↪ " + alias,
						arg: vaultArg,
						quicklookurl: absolutePath,
						type: "file:skipcheck",
						uid: `${vaultArg}_${alias}`,
						icon: { path: "icons/alias.png" },
						mods: {
							alt: { arg: vaultArg },
							ctrl: { arg: vaultArg },
						},
					});
				}
			}

			// Headings
			if (!file.headings) continue; // skips iteration if no heading
			for (const heading of file.headings) {
				const hName = heading.heading;
				const hLevel = heading.level;
				if (headingIgnore[hLevel]) continue; // skips iteration if heading has been configured as ignore
				const headingArg = `${vaultFolder}|${relativePath}#${hName}`;

				resultsArr.push({
					title: hName,
					match: camelCaseMatch(hName) + `h${hLevel} ${vaultFolder} ${propMatcher}`,
					subtitle: propPrefix + "➣ " + vaultFolder + "/" + filename,
					arg: headingArg,
					uid: headingArg,
					quicklookurl: absolutePath,
					icon: { path: `icons/headings/h${hLevel}.png` },
					mods: {
						alt: { arg: vaultArg }, // reveal the file itself, not the heading fragment
						ctrl: { arg: headingArg }, // copy-note-link.js reads the heading after "#"
					},
				});
			}
		}
	}

	if (resultsArr.length === 0) {
		resultsArr.push({
			title: "No notes found.",
			subtitle: "Check the vault path and \"Additional vault folders\" workflow configuration.",
			valid: false,
		});
	}

	return JSON.stringify({ items: resultsArr });
}
