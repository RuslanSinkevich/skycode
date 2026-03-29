import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { SkycodeToolSpec } from "../spec"
import { TASK_PROGRESS_PARAMETER } from "../types"

const GENERIC: SkycodeToolSpec = {
	variant: ModelFamily.GENERIC,
	id: SkycodeDefaultTool.WEB_FETCH,
	name: "web_fetch",
	description: `Fetches content from a specified URL using a local headless browser and returns it as Markdown
- Takes a URL and analysis prompt as input
- Opens the URL in a local headless Chromium, extracts page content, and converts to Markdown
- Use this tool when you need to retrieve and analyze web content
- The URL must be a fully-formed valid URL
- This tool is read-only and does not modify any files`,
	parameters: [
		{
			name: "url",
			required: true,
			instruction: "The URL to fetch content from",
			usage: "https://example.com/docs",
		},
		{
			name: "prompt",
			required: true,
			instruction: "The prompt to use for analyzing the webpage content",
			usage: "Summarize the main points and key takeaways",
		},
		TASK_PROGRESS_PARAMETER,
	],
}

const NATIVE_NEXT_GEN: SkycodeToolSpec = {
	variant: ModelFamily.NATIVE_NEXT_GEN,
	id: SkycodeDefaultTool.WEB_FETCH,
	name: "web_fetch",
	description:
		"Fetches content from a specified URL using a local headless browser and returns it as Markdown for analysis.",
	parameters: [
		{
			name: "url",
			required: true,
			instruction: "The URL to fetch content from",
		},
		{
			name: "prompt",
			required: true,
			instruction: "Prompt for analyzing the webpage content",
		},
		TASK_PROGRESS_PARAMETER,
	],
}

const NATIVE_GPT_5: SkycodeToolSpec = {
	...NATIVE_NEXT_GEN,
	variant: ModelFamily.NATIVE_GPT_5,
}

export const web_fetch_variants = [GENERIC, NATIVE_GPT_5, NATIVE_NEXT_GEN]
