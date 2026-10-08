#!/usr/bin/env node
// proto-lint.mjs — Windows-friendly proto lint stub.
//
// Upstream uses a bash-based `proto-lint.sh` that runs `buf lint` on `proto/**`.
// On Windows without WSL/Git Bash that script is unusable. This stub performs
// the same basic invariants in plain Node.js so `npm run lint:proto` works
// cross-platform.
//
// Checks:
//  - Every .proto file has a `syntax = "proto3"` declaration.
//  - Every .proto file has a `package` line.
//  - Every .proto file ends with a newline.
//
// If `buf` is available on PATH, we also defer to it for the real check.

import { execSync } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import url from "node:url"

const here = path.dirname(url.fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..")
const protoRoot = path.join(repoRoot, "proto")

async function listProtoFiles(dir) {
	const out = []
	const entries = await fs.readdir(dir, { withFileTypes: true })
	for (const e of entries) {
		const full = path.join(dir, e.name)
		if (e.isDirectory()) {
			out.push(...(await listProtoFiles(full)))
		} else if (e.isFile() && e.name.endsWith(".proto")) {
			out.push(full)
		}
	}
	return out
}

function bufAvailable() {
	try {
		execSync("buf --version", { stdio: "ignore" })
		return true
	} catch {
		return false
	}
}

async function main() {
	if (bufAvailable()) {
		try {
			execSync("buf lint", { cwd: repoRoot, stdio: "inherit" })
			return
		} catch (err) {
			process.exitCode = err.status ?? 1
			return
		}
	}

	const files = await listProtoFiles(protoRoot)
	const problems = []
	for (const f of files) {
		const text = await fs.readFile(f, "utf8")
		if (!/^\s*syntax\s*=\s*"proto3"\s*;/m.test(text)) {
			problems.push(`${path.relative(repoRoot, f)}: missing 'syntax = "proto3";'`)
		}
		if (!/^\s*package\s+[\w.]+\s*;/m.test(text)) {
			problems.push(`${path.relative(repoRoot, f)}: missing 'package' declaration`)
		}
		if (!text.endsWith("\n")) {
			problems.push(`${path.relative(repoRoot, f)}: file does not end with newline`)
		}
	}

	if (problems.length > 0) {
		console.error("proto-lint: issues found:")
		for (const p of problems) {
			console.error(`  - ${p}`)
		}
		process.exit(1)
	}

	console.log(`proto-lint: ${files.length} files OK`)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
