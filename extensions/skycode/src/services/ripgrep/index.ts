import { SkycodeIgnoreController } from "@core/ignore/SkycodeIgnoreController"
import * as childProcess from "child_process"
import * as path from "path"
import * as readline from "readline"
import { Logger } from "@/shared/services/Logger"
import { getBinaryLocation } from "@/utils/fs"

/**
 * This file provides functionality to perform regex searches on files using ripgrep.
 * Inspired by: https://github.com/DiscreteTom/vscode-ripgrep-utils
 *
 * Key components:
 *   - execRipgrep: Executes the ripgrep command and returns the output.
 *   - regexSearchFiles: The main function that performs regex searches on files.
 *     - Parameters:
 *       - cwd: The current working directory (for relative path calculation)
 *       - directoryPath: The directory to search in
 *       - regex: The regular expression to search for (Rust regex syntax)
 *       - filePattern: Optional glob pattern to filter files (default '*')
 *     - Returns: A formatted string containing search results with context
 *
 * The search results include:
 *   - Relative file paths
 *   - 2 lines of context before and after each match
 *   - Matches formatted with pipe characters for easy reading
 *
 * Usage example:
 *   const results = await regexSearchFiles('/path/to/cwd', '/path/to/search', 'TODO:', '*.ts');
 */

interface SearchResult {
	filePath: string
	line: number
	column: number
	match: string
	beforeContext: string[]
	afterContext: string[]
}

const MAX_RESULTS = 300
const RG_MAX_COUNT = 500
const RG_THREADS = 4
const RG_TIMEOUT_MS = 45_000

function isLikelyLiteralPattern(pattern: string): boolean {
	// Treat patterns without common regex metacharacters as literals
	return !/[\\^$.|?*+()[\]{}]/.test(pattern)
}

interface RipgrepRun {
	output: string
	timedOut: boolean
}

/**
 * [SKYCODE] Чистая логика итога запуска rg: частичные результаты не выбрасываем.
 * Ошибка — только если вывода нет совсем И есть ошибка процесса или stderr.
 */
export function resolveRipgrepRun(run: { output: string; errorOutput: string; processError?: string; timedOut: boolean }): RipgrepRun {
	const { output, errorOutput, processError, timedOut } = run
	if (!output && (processError || errorOutput)) {
		throw new Error(`ripgrep process error: ${processError || errorOutput}`)
	}
	return { output, timedOut }
}

export function timeoutNote(): string {
	return `(Search stopped after ${RG_TIMEOUT_MS / 1000}s — results may be incomplete. The folder may be slow to read the first time; repeating the same search is usually fast, or narrow the path / file_pattern.)`
}

async function execRipgrep(args: string[]): Promise<RipgrepRun> {
	const binPath: string = await getBinaryLocation("rg")

	return new Promise((resolve, reject) => {
		const rgProcess = childProcess.spawn(binPath, args)
		let settled = false
		// cross-platform alternative to head, which is ripgrep author's recommendation for limiting output.
		const rl = readline.createInterface({
			input: rgProcess.stdout,
			crlfDelay: Infinity, // treat \r\n as a single line break even if it's split across chunks. This ensures consistent behavior across different operating systems.
		})

		let output = ""
		let lineCount = 0
		const maxLines = MAX_RESULTS * 5 // limiting ripgrep output with max lines since there's no other way to limit results. it's okay that we're outputting as json, since we're parsing it line by line and ignore anything that's not part of a match. This assumes each result is at most 5 lines.

		rl.on("line", (line) => {
			if (lineCount < maxLines) {
				output += line + "\n"
				lineCount++
			} else {
				rl.close()
				rgProcess.kill()
			}
		})

		let errorOutput = ""
		rgProcess.stderr.on("data", (data) => {
			errorOutput += data.toString()
		})
		const finish = (timedOut: boolean, processError?: string) => {
			try {
				resolve(resolveRipgrepRun({ output, errorOutput, processError, timedOut }))
			} catch (e) {
				reject(e)
			}
		}
		const timeout = setTimeout(() => {
			if (settled) { return }
			settled = true
			rl.close()
			rgProcess.kill()
			// [SKYCODE] По таймауту отдаём то, что успели собрать, с флагом
			finish(true)
		}, RG_TIMEOUT_MS)
		rl.on("close", () => {
			if (settled) { return }
			settled = true
			clearTimeout(timeout)
			finish(false)
		})
		rgProcess.on("error", (error) => {
			if (settled) { return }
			settled = true
			clearTimeout(timeout)
			finish(false, error.message)
		})
	})
}

export async function regexSearchFiles(
	cwd: string,
	directoryPath: string,
	regex: string,
	filePattern?: string,
	skycodeIgnoreController?: SkycodeIgnoreController,
): Promise<string> {
	const args = [
		"--json",
		"--max-count",
		String(RG_MAX_COUNT),
		"--threads",
		String(RG_THREADS),
		"-e",
		regex,
		"--glob",
		filePattern || "*",
		"--context",
		"1",
		directoryPath,
	]
	if (isLikelyLiteralPattern(regex)) {
		args.unshift("--fixed-strings")
	}

	let output: string
	let timedOut = false
	try {
		;({ output, timedOut } = await execRipgrep(args))
	} catch (error) {
		const cause = error instanceof Error ? error.message : String(error)
		throw Error(`Error calling ripgrep: ${cause}`, { cause: error })
	}
	const results: SearchResult[] = []
	let currentResult: Partial<SearchResult> | null = null

	output.split("\n").forEach((line) => {
		if (line) {
			try {
				const parsed = JSON.parse(line)
				if (parsed.type === "match") {
					if (currentResult) {
						results.push(currentResult as SearchResult)
					}
					currentResult = {
						filePath: parsed.data.path.text,
						line: parsed.data.line_number,
						column: parsed.data.submatches[0].start,
						match: parsed.data.lines.text,
						beforeContext: [],
						afterContext: [],
					}
				} else if (parsed.type === "context" && currentResult) {
					if (parsed.data.line_number < currentResult.line!) {
						currentResult.beforeContext!.push(parsed.data.lines.text)
					} else {
						currentResult.afterContext!.push(parsed.data.lines.text)
					}
				}
			} catch (error) {
				Logger.error("Error parsing ripgrep output:", error)
			}
		}
	})

	if (currentResult) {
		results.push(currentResult as SearchResult)
	}

	// Filter results using SkycodeIgnoreController if provided
	const filteredResults = skycodeIgnoreController
		? results.filter((result) => skycodeIgnoreController.validateAccess(result.filePath))
		: results

	const formatted = formatResults(filteredResults, cwd)
	return timedOut ? `${formatted}\n\n${timeoutNote()}` : formatted
}

const MAX_RIPGREP_MB = 0.25
const MAX_BYTE_SIZE = MAX_RIPGREP_MB * 1024 * 1024 // 0./25MB in bytes

export function formatResults(results: SearchResult[], cwd: string): string {
	const groupedResults: { [key: string]: SearchResult[] } = {}

	let output = ""
	if (results.length >= MAX_RESULTS) {
		output += `Showing first ${MAX_RESULTS} of ${MAX_RESULTS}+ results. Use a more specific search if necessary.\n\n`
	} else {
		output += `Found ${results.length === 1 ? "1 result" : `${results.length.toLocaleString()} results`}.\n\n`
	}

	// Group results by file name
	results.slice(0, MAX_RESULTS).forEach((result) => {
		const relativeFilePath = path.relative(cwd, result.filePath)
		if (!groupedResults[relativeFilePath]) {
			groupedResults[relativeFilePath] = []
		}
		groupedResults[relativeFilePath].push(result)
	})

	// Track byte size
	let byteSize = Buffer.byteLength(output, "utf8")
	let wasLimitReached = false

	for (const [filePath, fileResults] of Object.entries(groupedResults)) {
		// Check if adding this file's path would exceed the byte limit
		const filePathString = `${filePath.toPosix()}\n\u2502----\n`
		const filePathBytes = Buffer.byteLength(filePathString, "utf8")

		if (byteSize + filePathBytes >= MAX_BYTE_SIZE) {
			wasLimitReached = true
			break
		}

		output += filePathString
		byteSize += filePathBytes

		for (let resultIndex = 0; resultIndex < fileResults.length; resultIndex++) {
			const result = fileResults[resultIndex]
			const allLines = [...result.beforeContext, result.match, ...result.afterContext]
			// [SKYCODE] \u041d\u043e\u043c\u0435\u0440\u0430 \u0441\u0442\u0440\u043e\u043a, \u043a\u0430\u043a \u0432 read_file: \u043c\u043e\u0434\u0435\u043b\u044c \u0441\u0440\u0430\u0437\u0443 \u0447\u0438\u0442\u0430\u0435\u0442 \u043d\u0443\u0436\u043d\u044b\u0439 \u0434\u0438\u0430\u043f\u0430\u0437\u043e\u043d, \u0430 \u043d\u0435 \u0443\u0433\u0430\u0434\u044b\u0432\u0430\u0435\u0442
			const firstLine = result.line - result.beforeContext.length

			// Calculate bytes in all lines for this result
			let resultBytes = 0
			const resultLines: string[] = []

			for (const [lineIndex, line] of allLines.entries()) {
				const trimmedLine = line?.trimEnd() ?? ""
				const lineString = `\u2502${String(firstLine + lineIndex).padStart(6)}|${trimmedLine}\n`
				const lineBytes = Buffer.byteLength(lineString, "utf8")

				// Check if adding this line would exceed the byte limit
				if (byteSize + resultBytes + lineBytes >= MAX_BYTE_SIZE) {
					wasLimitReached = true
					break
				}

				resultLines.push(lineString)
				resultBytes += lineBytes
			}

			// If we hit the limit in the middle of processing lines, break out of the result loop
			if (wasLimitReached) {
				break
			}

			// Add all lines for this result to the output
			resultLines.forEach((line) => {
				output += line
			})
			byteSize += resultBytes

			// Add separator between results if needed
			if (resultIndex < fileResults.length - 1) {
				const separatorString = "\u2502----\n"
				const separatorBytes = Buffer.byteLength(separatorString, "utf8")

				if (byteSize + separatorBytes >= MAX_BYTE_SIZE) {
					wasLimitReached = true
					break
				}

				output += separatorString
				byteSize += separatorBytes
			}

			// Check if we've hit the byte limit
			if (byteSize >= MAX_BYTE_SIZE) {
				wasLimitReached = true
				break
			}
		}

		// If we hit the limit, break out of the file loop
		if (wasLimitReached) {
			break
		}

		const closingString = "\u2502----\n\n"
		const closingBytes = Buffer.byteLength(closingString, "utf8")

		if (byteSize + closingBytes >= MAX_BYTE_SIZE) {
			wasLimitReached = true
			break
		}

		output += closingString
		byteSize += closingBytes
	}

	// Add a message if we hit the byte limit
	if (wasLimitReached) {
		const truncationMessage = `\n[Results truncated due to exceeding the ${MAX_RIPGREP_MB}MB size limit. Please use a more specific search pattern.]`
		// Only add the message if it fits within the limit
		if (byteSize + Buffer.byteLength(truncationMessage, "utf8") < MAX_BYTE_SIZE) {
			output += truncationMessage
		}
	}

	return output.trim()
}
