#!/usr/bin/env node
/**
 * Download better-sqlite3 prebuilds for each Electron version the extension may run under.
 * Copies into native/sqlite/electron-{version}-{platform}-{arch}/ (picked at runtime in IndexStorage).
 */
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const extensionRoot = path.join(__dirname, "..")
const vscodePkgPath = path.join(extensionRoot, "..", "..", "package.json")
const moduleDir = path.join(extensionRoot, "node_modules", "better-sqlite3")
const outRoot = path.join(extensionRoot, "native", "sqlite")

function readForkElectronVersion() {
	if (!fs.existsSync(vscodePkgPath)) {
		return null
	}
	const pkg = JSON.parse(fs.readFileSync(vscodePkgPath, "utf8"))
	const v = pkg.devDependencies?.electron
	return v ? v.replace(/^[\^~]/, "") : null
}

function resolveElectronVersions() {
	if (process.env.ELECTRON_VERSIONS) {
		return process.env.ELECTRON_VERSIONS.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
	}
	const fork = readForkElectronVersion()
	// VS Code 1.105.x line (common when the extension is installed outside the Skycode fork)
	const versions = new Set([fork, "37.6.0"].filter(Boolean))
	return [...versions]
}

if (!fs.existsSync(moduleDir)) {
	console.error("rebuild-native: better-sqlite3 not installed — run npm install")
	process.exit(1)
}

const platform = process.env.npm_config_platform || process.platform
const arch = process.env.npm_config_arch || process.arch
const verbose = process.argv.includes("-v") || process.argv.includes("--verbose")
const vFlag = verbose ? "--verbose" : ""
const versions = resolveElectronVersions()

if (versions.length === 0) {
	console.error("rebuild-native: no Electron versions (set ELECTRON_VERSIONS)")
	process.exit(1)
}

fs.mkdirSync(outRoot, { recursive: true })

for (const electronVersion of versions) {
	const destDir = path.join(outRoot, `electron-${electronVersion}-${platform}-${arch}`)
	console.log(`rebuild-native: electron ${electronVersion} (${platform}-${arch})`)
	const cmd = `npx prebuild-install --runtime=electron --target=${electronVersion} --platform=${platform} --arch=${arch} ${vFlag}`.trim()
	execSync(cmd, { cwd: moduleDir, stdio: "inherit" })

	const built = path.join(moduleDir, "build", "Release", "better_sqlite3.node")
	if (!fs.existsSync(built)) {
		console.error(`rebuild-native: missing ${built} for electron ${electronVersion}`)
		process.exit(1)
	}
	fs.mkdirSync(destDir, { recursive: true })
	fs.copyFileSync(built, path.join(destDir, "better_sqlite3.node"))
	console.log("rebuild-native: OK", destDir)
}

// Default binding for local Node tooling (same as fork target when present)
const primary = readForkElectronVersion() || versions[versions.length - 1]
const primarySrc = path.join(outRoot, `electron-${primary}-${platform}-${arch}`, "better_sqlite3.node")
const defaultDest = path.join(moduleDir, "build", "Release")
fs.mkdirSync(defaultDest, { recursive: true })
fs.copyFileSync(primarySrc, path.join(defaultDest, "better_sqlite3.node"))
console.log("rebuild-native: default -> build/Release")
