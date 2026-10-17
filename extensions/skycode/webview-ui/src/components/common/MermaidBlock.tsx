import { StringRequest } from "@shared/proto/skycode/common"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import mermaid from "mermaid"
import { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { useI18n } from "@/i18n"
import { FileServiceClient } from "@/services/grpc-client"
import { quoteMermaidLabels } from "./mermaidFix"
import { useDebounceEffect } from "@/utils/useDebounceEffect"

// [SKYCODE] Схемы в цветах текущей темы VS Code. Mermaid считает производные цвета сам,
// поэтому нужны настоящие значения, а не var(--…) — читаем их перед каждой отрисовкой.
function themeColor(name: string, fallback: string): string {
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
	return value || fallback
}

function initMermaidForTheme() {
	const foreground = themeColor("--vscode-foreground", "#cccccc")
	const background = themeColor("--vscode-editor-background", "#1e1e1e")
	const nodeFill = themeColor("--vscode-editorWidget-background", "#252526")
	const accent = themeColor("--vscode-focusBorder", "#007fd4")
	const muted = themeColor("--vscode-descriptionForeground", "#9d9d9d")
	const fontFamily = themeColor("--vscode-font-family", "'Segoe UI', sans-serif")
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: "strict",
		theme: "base",
		fontFamily,
		themeVariables: {
			darkMode: !document.body.classList.contains("vscode-light"),
			background,
			fontFamily,
			fontSize: "13px",
			primaryColor: nodeFill,
			primaryTextColor: foreground,
			primaryBorderColor: accent,
			secondaryColor: nodeFill,
			tertiaryColor: background,
			mainBkg: nodeFill,
			nodeBorder: accent,
			nodeTextColor: foreground,
			textColor: foreground,
			lineColor: muted,
			edgeLabelBackground: background,
			clusterBkg: background,
			clusterBorder: muted,
			titleColor: foreground,
			actorBkg: nodeFill,
			actorBorder: accent,
			actorTextColor: foreground,
			signalColor: muted,
			signalTextColor: foreground,
			noteBkgColor: nodeFill,
			noteTextColor: foreground,
			noteBorderColor: muted,
		},
		// Подписи обычным SVG-текстом: при открытии крупной картинкой не обрезаются;
		// натуральный размер вместо ужатия до ширины колонки — широкая схема прокручивается
		flowchart: { htmlLabels: false, useMaxWidth: false, curve: "basis", padding: 12, nodeSpacing: 36, rankSpacing: 44 },
		sequence: { useMaxWidth: false },
		class: { useMaxWidth: false },
		er: { useMaxWidth: false },
		state: { useMaxWidth: false },
	})
}

// [SKYCODE] Счётчик смен темы VS Code: меняется при смене класса body / data-vscode-theme-*,
// чтобы схемы перерисовались в новых цветах
function useThemeVersion(): number {
	const [version, setVersion] = useState(0)
	useEffect(() => {
		if (typeof MutationObserver === "undefined") {
			return
		}
		const observer = new MutationObserver(() => setVersion((v) => v + 1))
		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ["class", "data-vscode-theme-kind", "data-vscode-theme-id"],
		})
		// CSS-переменные темы VS Code ставит в style корневого элемента
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] })
		return () => observer.disconnect()
	}, [])
	return version
}

interface MermaidBlockProps {
	code: string
}

export default function MermaidBlock({ code }: MermaidBlockProps) {
	const { t } = useI18n()
	const containerRef = useRef<HTMLDivElement>(null)
	const [isLoading, setIsLoading] = useState(false)
	const themeVersion = useThemeVersion()

	// 1) Whenever `code` changes, mark that we need to re-render a new chart
	useEffect(() => {
		setIsLoading(true)
	}, [code, themeVersion])

	// 2) Debounce the actual parse/render
	useDebounceEffect(
		() => {
			if (containerRef.current) {
				containerRef.current.innerHTML = ""
			}
			// [SKYCODE] Если схема не разобралась — пробуем ещё раз с подписями в кавычках
			initMermaidForTheme()
			const pickValidCode = async (): Promise<string> => {
				if (await mermaid.parse(code, { suppressErrors: true })) {
					return code
				}
				const fixed = quoteMermaidLabels(code)
				if (fixed !== code && (await mermaid.parse(fixed, { suppressErrors: true }))) {
					return fixed
				}
				throw new Error("Invalid or incomplete Mermaid code")
			}
			pickValidCode()
				.then((validCode) => {
					const id = `mermaid-${Math.random().toString(36).substring(2)}`
					return mermaid.render(id, validCode)
				})
				.then(({ svg }) => {
					if (containerRef.current) {
						containerRef.current.innerHTML = svg
					}
				})
				.catch((err) => {
					console.warn("Mermaid parse/render failed:", err)
					// Не разобралась — показываем код как код, с переносами строк, а не слепленным абзацем
					if (containerRef.current) {
						const pre = document.createElement("pre")
						pre.style.whiteSpace = "pre-wrap"
						pre.style.margin = "0"
						pre.textContent = code
						containerRef.current.replaceChildren(pre)
					}
				})
				.finally(() => {
					setIsLoading(false)
				})
		},
		500, // Delay 500ms
		[code, themeVersion], // Dependencies for scheduling
	)

	/**
	 * Called when user clicks the rendered diagram.
	 * Converts the <svg> to a PNG and sends it to the extension.
	 */
	const handleClick = async () => {
		if (!containerRef.current) {
			return
		}
		const svgEl = containerRef.current.querySelector("svg")
		if (!svgEl) {
			return
		}

		try {
			const pngDataUrl = await svgToPng(svgEl)
			FileServiceClient.openImage(StringRequest.create({ value: pngDataUrl })).catch((err) =>
				console.error("Failed to open image:", err),
			)
		} catch (err) {
			console.error("Error converting SVG to PNG:", err)
		}
	}

	const handleCopyCode = async () => {
		try {
			await navigator.clipboard.writeText(code)
		} catch (err) {
			console.error("Copy failed", err)
		}
	}

	return (
		<MermaidBlockContainer>
			{isLoading && <LoadingMessage>{t("mermaid.generating")}</LoadingMessage>}
			<ButtonContainer>
				<StyledVSCodeButton aria-label={t("mermaid.copyCode")} onClick={handleCopyCode} title={t("mermaid.copyCode")}>
					<span className="codicon codicon-copy"></span>
				</StyledVSCodeButton>
			</ButtonContainer>
			<SvgContainer $isLoading={isLoading} onClick={handleClick} ref={containerRef} />
		</MermaidBlockContainer>
	)
}

async function svgToPng(svgEl: SVGElement): Promise<string> {
	console.log("svgToPng function called")
	// Clone the SVG to avoid modifying the original
	const svgClone = svgEl.cloneNode(true) as SVGElement

	// Get the original viewBox
	const viewBox = svgClone.getAttribute("viewBox")?.split(" ").map(Number) || []
	const originalWidth = viewBox[2] || svgClone.clientWidth
	const originalHeight = viewBox[3] || svgClone.clientHeight

	// Calculate the scale factor to fit editor width while maintaining aspect ratio

	// Unless we can find a way to get the actual editor window dimensions through the VS Code API (which might be possible but would require changes to the extension side),
	// the fixed width seems like a reliable approach.
	const editorWidth = 3_600

	const scale = editorWidth / originalWidth
	const scaledHeight = originalHeight * scale

	// Update SVG dimensions
	svgClone.setAttribute("width", `${editorWidth}`)
	svgClone.setAttribute("height", `${scaledHeight}`)

	const serializer = new XMLSerializer()
	const svgString = serializer.serializeToString(svgClone)
	const encoder = new TextEncoder()
	const bytes = encoder.encode(svgString)
	const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
	const svgDataUrl = `data:image/svg+xml;base64,${base64}`

	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => {
			const canvas = document.createElement("canvas")
			canvas.width = editorWidth
			canvas.height = scaledHeight

			const ctx = canvas.getContext("2d")
			if (!ctx) {
				return reject("Canvas context not available")
			}

			// Fill background with Mermaid's dark theme background color
			ctx.fillStyle = themeColor("--vscode-editor-background", "#1e1e1e")
			ctx.fillRect(0, 0, canvas.width, canvas.height)

			ctx.imageSmoothingEnabled = true
			ctx.imageSmoothingQuality = "high"

			ctx.drawImage(img, 0, 0, editorWidth, scaledHeight)
			resolve(canvas.toDataURL("image/png", 1.0))
		}
		img.onerror = reject
		img.src = svgDataUrl
	})
}

const MermaidBlockContainer = styled.div`
	position: relative;
	margin: 8px 0;
`

const ButtonContainer = styled.div`
	position: absolute;
	top: 8px;
	right: 8px;
	z-index: 1;
	opacity: 0.6;
	transition: opacity 0.2s ease;

	&:hover {
		opacity: 1;
	}
`

const LoadingMessage = styled.div`
	padding: 8px 0;
	color: var(--vscode-descriptionForeground);
	font-style: italic;
	font-size: 0.9em;
`

interface SvgContainerProps {
	$isLoading: boolean
}

const SvgContainer = styled.div<SvgContainerProps>`
	opacity: ${(props) => (props.$isLoading ? 0.3 : 1)};
	min-height: 20px;
	transition: opacity 0.2s ease;
	cursor: pointer;
	overflow-x: auto;
	padding: 8px 0;

	& > svg {
		display: block;
		margin: 0 auto;
		max-width: none;
	}
`

const StyledVSCodeButton = styled(VSCodeButton)`
	padding: 4px;
	height: 24px;
	width: 24px;
	min-width: unset;
	background-color: var(--vscode-button-secondaryBackground);
	color: var(--vscode-button-secondaryForeground);
	border: 1px solid var(--vscode-button-border);
	border-radius: 3px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.2s ease;

	.codicon {
		font-size: 14px;
	}

	&:hover {
		background-color: var(--vscode-button-secondaryHoverBackground);
		border-color: var(--vscode-button-border);
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	&:active {
		transform: translateY(0);
		box-shadow: none;
	}
`
