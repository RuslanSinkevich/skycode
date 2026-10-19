import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import * as esbuild from "esbuild"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const production = process.argv.includes("--production") || process.env["IS_DEBUG_BUILD"] === "false"
const watch = process.argv.includes("--watch")
const destDir = "dist"

/**
 * @type {import('esbuild').Plugin}
 */
const aliasResolverPlugin = {
	name: "alias-resolver",
	setup(build) {
		const aliases = {
			"@": path.resolve(__dirname, "src"),
			"@core": path.resolve(__dirname, "src/core"),
			"@integrations": path.resolve(__dirname, "src/integrations"),
			"@services": path.resolve(__dirname, "src/services"),
			"@shared": path.resolve(__dirname, "src/shared"),
			"@utils": path.resolve(__dirname, "src/utils"),
			"@packages": path.resolve(__dirname, "src/packages"),
		}

		// For each alias entry, create a resolver
		Object.entries(aliases).forEach(([alias, aliasPath]) => {
			const aliasRegex = new RegExp(`^${alias}($|/.*)`)
			build.onResolve({ filter: aliasRegex }, (args) => {
				const importPath = args.path.replace(alias, aliasPath)

				// First, check if the path exists as is
				if (fs.existsSync(importPath)) {
					const stats = fs.statSync(importPath)
					if (stats.isDirectory()) {
						// If it's a directory, try to find index files
						const extensions = [".ts", ".tsx", ".js", ".jsx"]
						for (const ext of extensions) {
							const indexFile = path.join(importPath, `index${ext}`)
							if (fs.existsSync(indexFile)) {
								return { path: indexFile }
							}
						}
					} else {
						// It's a file that exists, so return it
						return { path: importPath }
					}
				}

				// If the path doesn't exist, try appending extensions
				const extensions = [".ts", ".tsx", ".js", ".jsx"]
				for (const ext of extensions) {
					const pathWithExtension = `${importPath}${ext}`
					if (fs.existsSync(pathWithExtension)) {
						return { path: pathWithExtension }
					}
				}

				// If nothing worked, return the original path and let esbuild handle the error
				return { path: importPath }
			})
		})
	},
}

const esbuildProblemMatcherPlugin = {
	name: "esbuild-problem-matcher",

	setup(build) {
		build.onStart(() => {
			console.log("[watch] build started")
		})
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`)
				console.error(`    ${location.file}:${location.line}:${location.column}:`)
			})
			console.log("[watch] build finished")
		})
	},
}

const copyWasmFiles = {
	name: "copy-wasm-files",
	setup(build) {
		build.onEnd(() => {
			// Copy assets (static MCP marketplace catalog, etc.)
			const assetsSourceDir = path.join(__dirname, "assets")
			const assetsTargetDir = path.join(__dirname, destDir, "assets")
			if (fs.existsSync(assetsSourceDir)) {
				if (!fs.existsSync(assetsTargetDir)) {
					fs.mkdirSync(assetsTargetDir, { recursive: true })
				}
				for (const file of fs.readdirSync(assetsSourceDir)) {
					const src = path.join(assetsSourceDir, file)
					if (fs.statSync(src).isFile()) {
						fs.copyFileSync(src, path.join(assetsTargetDir, file))
					}
				}
			}

			// tree sitter
			const sourceDir = path.join(__dirname, "node_modules", "web-tree-sitter")
			const targetDir = path.join(__dirname, destDir)

			// Copy tree-sitter.wasm
			fs.copyFileSync(path.join(sourceDir, "tree-sitter.wasm"), path.join(targetDir, "tree-sitter.wasm"))

			// Copy language-specific WASM files
			const languageWasmDir = path.join(__dirname, "node_modules", "tree-sitter-wasms", "out")
			const languages = [
				"typescript",
				"tsx",
				"python",
				"rust",
				"javascript",
				"go",
				"cpp",
				"c",
				"c_sharp",
				"ruby",
				"java",
				"php",
				"swift",
				"kotlin",
			]

			languages.forEach((lang) => {
				const filename = `tree-sitter-${lang}.wasm`
				fs.copyFileSync(path.join(languageWasmDir, filename), path.join(targetDir, filename))
			})
		})
	},
}

const buildEnvVars = {
	"import.meta.url": "_importMetaUrl",
}

if (production) {
	// IS_DEV is always disable in production builds.
	buildEnvVars["process.env.IS_DEV"] = "false"
}
if (process.env.SKYCODE_ENVIRONMENT) {
	buildEnvVars["process.env.SKYCODE_ENVIRONMENT"] = JSON.stringify(process.env.SKYCODE_ENVIRONMENT)
}
// Base configuration shared between the extension and worker builds
const baseConfig = {
	bundle: true,
	minify: production,
	sourcemap: !production,
	logLevel: "silent",
	define: buildEnvVars,
	tsconfig: path.resolve(__dirname, "tsconfig.json"),
	plugins: [
		copyWasmFiles,
		aliasResolverPlugin,
		/* add to the end of plugins array */
		esbuildProblemMatcherPlugin,
	],
	format: "cjs",
	sourcesContent: false,
	platform: "node",
	banner: {
		js: "const _importMetaUrl=require('url').pathToFileURL(__filename)",
	},
}

// Extension-specific configuration
const extensionConfig = {
	...baseConfig,
	entryPoints: ["src/extension.ts"],
	outfile: `${destDir}/extension.js`,
	external: ["vscode", "onnxruntime-node"],
}

// Worker thread for embedding computation (separate bundle, loaded at runtime)
const workerConfig = {
	...baseConfig,
	entryPoints: ["src/core/indexing/workers/embedding-worker.ts"],
	outfile: `${destDir}/embedding-worker.js`,
	external: ["vscode", "onnxruntime-node"],
	// Worker needs _importMetaUrl banner for dynamic imports
	plugins: [aliasResolverPlugin, esbuildProblemMatcherPlugin],
}

// [SKYCODE] Воркер диктовки GigaAM (sherpa-onnx). Нативный аддон не бандлится — он грузится
// в рантайме из папки, куда его скачивает SherpaLocalService.
const sherpaWorkerConfig = {
	...baseConfig,
	entryPoints: ["src/services/dictation/workers/sherpa-dictation-worker.ts"],
	outfile: `${destDir}/sherpa-dictation-worker.js`,
	external: ["vscode"],
	plugins: [aliasResolverPlugin, esbuildProblemMatcherPlugin],
}

async function main() {
	// Build main extension
	const extensionCtx = await esbuild.context(extensionConfig)

	// Build workers
	const workerCtx = await esbuild.context(workerConfig)
	const sherpaWorkerCtx = await esbuild.context(sherpaWorkerConfig)
	if (watch) {
		await workerCtx.watch()
		await sherpaWorkerCtx.watch()
	} else {
		await workerCtx.rebuild()
		await workerCtx.dispose()
		await sherpaWorkerCtx.rebuild()
		await sherpaWorkerCtx.dispose()
	}

	if (watch) {
		await extensionCtx.watch()
	} else {
		await extensionCtx.rebuild()
		await extensionCtx.dispose()
	}
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
