import type { AutoApprovalSettings } from "./AutoApprovalSettings"

/**
 * [SKYCODE] Commands that run without asking, out of the box.
 *
 * Everything here only reads state: no writes, no network, no package
 * installs, no branch or history rewriting. `git branch` is listed bare (and
 * with `-a`) on purpose — `git branch *` would also match `git branch -D`,
 * which deletes a branch.
 *
 * Wildcards are safe here because {@link findAllowedCommandPattern} refuses to
 * auto-approve a command that chains or redirects (`&&`, `|`, `>`, `$(`, …)
 * unless the pattern itself asks for it.
 */
export const DEFAULT_ALLOWED_COMMAND_PATTERNS: string[] = [
	// git — inspection only
	"git status",
	"git status *",
	"git diff",
	"git diff *",
	"git log",
	"git log *",
	"git show *",
	"git branch",
	"git branch -a",
	"git remote -v",
	"git rev-parse *",
	"git stash list",
	// filesystem — listing only
	"ls",
	"ls *",
	"dir",
	"pwd",
	// toolchain probes
	"node --version",
	"node -v",
	"npm --version",
	"npm -v",
	"npm ls",
	"npm ls *",
	"npm run",
	"git --version",
	"python --version",
	"python3 --version",
	"tsc --version",
	"where *",
	"which *",
]

/**
 * Shell syntax that turns one command into several, or sends output somewhere:
 * `a && b`, `a | b`, `a > file`, `$(a)`, backticks, `a; b`.
 */
const SHELL_CONTROL_SYNTAX = /[|&;<>`]|\$\(/

/**
 * Wildcard match for a whitelist pattern: `*` is any sequence, `?` is one
 * character, everything else is literal, and the whole command must match.
 */
export function matchesCommandPattern(command: string, pattern: string): boolean {
	const regex = new RegExp(
		"^" +
			pattern
				.replace(/[.+^${}()|[\]\\]/g, "\\$&")
				.replace(/\*/g, ".*")
				.replace(/\?/g, ".") +
			"$",
		"s",
	)
	return regex.test(command)
}

/**
 * The patterns actually in force: the built-in ones the user has not switched
 * off, plus the ones they added by hand.
 */
export function getEffectiveAllowedCommandPatterns(actions: AutoApprovalSettings["actions"]): string[] {
	const disabled = new Set(actions.disabledDefaultCommandPatterns ?? [])
	const defaults = DEFAULT_ALLOWED_COMMAND_PATTERNS.filter((pattern) => !disabled.has(pattern))
	return [...defaults, ...(actions.allowedCommandPatterns ?? [])]
}

/**
 * The pattern that auto-approves this command, if any.
 *
 * A command that chains or redirects is never approved by a plain pattern:
 * `git log *` must not wave through `git log && rm -rf /`. A pattern that
 * contains such syntax itself is taken as deliberate and still matches.
 */
export function findAllowedCommandPattern(command: string, patterns: string[]): string | undefined {
	const trimmed = command.trim()
	if (trimmed.length === 0) {
		return undefined
	}

	const commandChains = SHELL_CONTROL_SYNTAX.test(trimmed)

	return patterns.find((pattern) => {
		if (commandChains && !SHELL_CONTROL_SYNTAX.test(pattern)) {
			return false
		}
		return matchesCommandPattern(trimmed, pattern)
	})
}
