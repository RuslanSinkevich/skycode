/**
 * List of email domains that are considered trusted testers for Skycode.
 */
const SKYCODE_TRUSTED_TESTER_DOMAINS = ["fibilabs.tech"]

/**
 * Checks if the given email belongs to a Skycode internal user.
 */
export function isSkycodeBotUser(email: string): boolean {
	return SKYCODE_TRUSTED_TESTER_DOMAINS.some((d) => email.endsWith(`@${d}`))
}

export function isSkycodeInternalTester(email: string): boolean {
	return isSkycodeBotUser(email) || SKYCODE_TRUSTED_TESTER_DOMAINS.some((d) => email.endsWith(`@${d}`))
}
