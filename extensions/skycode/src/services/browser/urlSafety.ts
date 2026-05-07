/**
 * URL safety guard against SSRF and local-resource access.
 *
 * Intended for URLs that originate from LLM output or untrusted workspace content
 * before they are passed to puppeteer / fetch / axios.
 *
 * Scope of checks (lexical, no DNS):
 *  - Scheme allowlist (http, https by default).
 *  - Reject userinfo in URL (user:pass@host).
 *  - Reject loopback, link-local, private, cloud-metadata and reserved IP literals.
 *  - Reject bare hostnames that are commonly local ("localhost", "*.localhost", etc).
 *
 * Not covered:
 *  - DNS rebinding. Caller should additionally restrict network in the browser
 *    (e.g. puppeteer request interception) for defense in depth.
 */

const DEFAULT_ALLOWED_SCHEMES = new Set(["http:", "https:"])

const FORBIDDEN_HOSTNAMES = new Set([
	"localhost",
	"ip6-localhost",
	"ip6-loopback",
	"broadcasthost",
])

const FORBIDDEN_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".home.arpa"]

export interface UrlSafetyOptions {
	allowedSchemes?: string[]
	/** Allow private / loopback addresses. Only for debug tooling. */
	allowPrivateNetwork?: boolean
}

export class UnsafeUrlError extends Error {
	readonly reason: string
	constructor(reason: string) {
		super(`Unsafe URL rejected: ${reason}`)
		this.name = "UnsafeUrlError"
		this.reason = reason
	}
}

function parseIPv4(host: string): number[] | undefined {
	const parts = host.split(".")
	if (parts.length !== 4) {
		return undefined
	}
	const octets: number[] = []
	for (const p of parts) {
		if (!/^\d+$/.test(p)) {
			return undefined
		}
		const n = Number(p)
		if (!Number.isInteger(n) || n < 0 || n > 255) {
			return undefined
		}
		octets.push(n)
	}
	return octets
}

function isPrivateIPv4(octets: number[]): boolean {
	const [a, b] = octets
	if (a === 0) return true // 0.0.0.0/8
	if (a === 10) return true // 10.0.0.0/8
	if (a === 127) return true // 127.0.0.0/8 loopback
	if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
	if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local + metadata
	if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
	if (a === 192 && b === 0) return true // 192.0.0.0/24 reserved
	if (a === 192 && b === 168) return true // 192.168.0.0/16
	if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
	if (a >= 224) return true // multicast / reserved / broadcast
	return false
}

function isPrivateIPv6(host: string): boolean {
	const lower = host.toLowerCase().replace(/^\[|\]$/g, "")
	if (lower === "::" || lower === "::1") return true
	if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true // link-local
	if (lower.startsWith("fc") || lower.startsWith("fd")) return true // unique-local fc00::/7
	if (lower.startsWith("ff")) return true // multicast
	if (lower.startsWith("::ffff:")) {
		// IPv4-mapped IPv6
		const v4 = lower.slice("::ffff:".length)
		const octets = parseIPv4(v4)
		if (octets && isPrivateIPv4(octets)) return true
	}
	return false
}

/**
 * Throws UnsafeUrlError on rejection. Returns the parsed URL on success.
 */
export function assertSafeUrl(rawUrl: string, opts: UrlSafetyOptions = {}): URL {
	let parsed: URL
	try {
		parsed = new URL(rawUrl)
	} catch {
		throw new UnsafeUrlError("malformed URL")
	}

	const allowed = new Set(opts.allowedSchemes ?? Array.from(DEFAULT_ALLOWED_SCHEMES))
	if (!allowed.has(parsed.protocol)) {
		throw new UnsafeUrlError(`scheme '${parsed.protocol}' is not allowed`)
	}

	if (parsed.username || parsed.password) {
		throw new UnsafeUrlError("credentials in URL are not allowed")
	}

	const hostname = parsed.hostname.toLowerCase()
	if (!hostname) {
		throw new UnsafeUrlError("empty host")
	}

	if (opts.allowPrivateNetwork) {
		return parsed
	}

	if (FORBIDDEN_HOSTNAMES.has(hostname)) {
		throw new UnsafeUrlError(`hostname '${hostname}' is local`)
	}
	for (const suffix of FORBIDDEN_HOSTNAME_SUFFIXES) {
		if (hostname.endsWith(suffix)) {
			throw new UnsafeUrlError(`hostname '${hostname}' has local suffix '${suffix}'`)
		}
	}

	const ipv4 = parseIPv4(hostname)
	if (ipv4 && isPrivateIPv4(ipv4)) {
		throw new UnsafeUrlError(`IPv4 '${hostname}' is in a reserved/private range`)
	}

	if (hostname.includes(":") && isPrivateIPv6(hostname)) {
		throw new UnsafeUrlError(`IPv6 '${hostname}' is in a reserved/private range`)
	}

	return parsed
}

/**
 * Predicate form of {@link assertSafeUrl}; returns false on any rejection.
 */
export function isSafeUrl(rawUrl: string, opts?: UrlSafetyOptions): boolean {
	try {
		assertSafeUrl(rawUrl, opts)
		return true
	} catch {
		return false
	}
}
