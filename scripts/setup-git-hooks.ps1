# Run from repo root once per clone (PowerShell):
#   .\scripts\setup-git-hooks.ps1
# Points Git at scripts/git-hooks so commit-msg strips Cursor attribution trailers.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

$hooksRel = "scripts/git-hooks"
git config core.hooksPath $hooksRel
Write-Host "core.hooksPath set to '$hooksRel' — Cursor co-author / Made-with lines are removed from new commits."
