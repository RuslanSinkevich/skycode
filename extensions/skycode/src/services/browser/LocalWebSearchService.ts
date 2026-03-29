import axios from "axios"
import * as cheerio from "cheerio"
import { getAxiosSettings } from "@/shared/net"
import { Logger } from "@/shared/services/Logger"

export interface WebSearchResult {
	title: string
	url: string
	snippet: string
}

export class LocalWebSearchService {
	async search(query: string, allowedDomains?: string[], blockedDomains?: string[]): Promise<WebSearchResult[]> {
		const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

		const response = await axios.get(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.5",
			},
			timeout: 10_000,
			...getAxiosSettings(),
		})

		const $ = cheerio.load(response.data)
		const results: WebSearchResult[] = []

		$(".result").each((_i, el) => {
			const titleEl = $(el).find(".result__title a")
			const snippetEl = $(el).find(".result__snippet")
			const title = titleEl.text().trim()
			const rawHref = titleEl.attr("href") || ""
			const realUrl = extractRealUrl(rawHref)
			const snippet = snippetEl.text().trim()

			if (title && realUrl && realUrl.startsWith("http")) {
				results.push({ title, url: realUrl, snippet })
			}
		})

		let filtered = results.slice(0, 10)

		if (allowedDomains && allowedDomains.length > 0) {
			filtered = filtered.filter((r) => {
				try {
					const host = new URL(r.url).hostname
					return allowedDomains.some((d) => host.includes(d))
				} catch {
					return false
				}
			})
		}

		if (blockedDomains && blockedDomains.length > 0) {
			filtered = filtered.filter((r) => {
				try {
					const host = new URL(r.url).hostname
					return !blockedDomains.some((d) => host.includes(d))
				} catch {
					return true
				}
			})
		}

		Logger.info(`LocalWebSearchService: query="${query}", results=${filtered.length}`)
		return filtered
	}
}

function extractRealUrl(duckUrl: string): string {
	try {
		if (duckUrl.includes("uddg=")) {
			const urlObj = new URL(duckUrl, "https://duckduckgo.com")
			const realUrl = urlObj.searchParams.get("uddg")
			if (realUrl) return realUrl
		}
		if (duckUrl.startsWith("http")) return duckUrl
	} catch {
		// ignore
	}
	return duckUrl
}
