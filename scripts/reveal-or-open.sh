#!/bin/zsh
relPath="$*"
# shellcheck disable=2154
vaultRoot="$vault_path"

# `oa` (multi-vault note search) prefixes the source vault's folder name
# before a "|", since its results aren't rooted at vault_path like everyone
# else's are.
if [[ "$relPath" == *"|"* ]] ; then
	vaultFolder="${relPath%%|*}"
	relPath="${relPath#*|}"
	vaultRoot="$vault_path/../$vaultFolder"
fi

absPath="$vaultRoot/$relPath"

if [[ -d "$absPath" ]] ; then
	open "$absPath"
elif [[ -f "$absPath" ]] ; then
	open -R "$absPath"
fi
