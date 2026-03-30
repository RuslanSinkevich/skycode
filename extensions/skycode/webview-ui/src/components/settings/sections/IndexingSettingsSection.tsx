import type { IndexingConfig, IndexingMode, IndexingPhase, IndexingProgress, LocalModelId } from "@shared/IndexingTypes"
import { DEFAULT_INDEXING_CONFIG, DEFAULT_INDEXING_PROGRESS } from "@shared/IndexingTypes"
import { VSCodeButton, VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { useCallback, useEffect, useState } from "react"
import { PLATFORM_CONFIG } from "@/config/platform.config"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import Section from "../Section"

interface IndexingSettingsSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

/** Send a single indexing config key update to extension backend */
function postIndexingConfigKey(key: string, value: any) {
	PLATFORM_CONFIG.postMessage({
		type: "updateIndexingConfig",
		indexingConfigUpdate: { key, value },
	})
}

/** Send indexing command to extension backend */
function postIndexingCommand(command: "reindex" | "clear" | "pause" | "resume") {
	PLATFORM_CONFIG.postMessage({
		type: "indexingCommand",
		indexingCommandAction: command,
	})
}

function formatTimestamp(ts?: number, locale?: string): string {
	if (!ts) {
		return "never"
	}
	const d = new Date(ts)
	return d.toLocaleString(locale)
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(0)} KB`
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const IndexingSettingsSection = ({ renderSectionHeader }: IndexingSettingsSectionProps) => {
	const { t, locale } = useI18n()
	const { indexingConfig: stateConfig, indexingProgress: stateProgress } = useExtensionState()

	const config: IndexingConfig = stateConfig ?? DEFAULT_INDEXING_CONFIG
	const progress: IndexingProgress = stateProgress ?? DEFAULT_INDEXING_PROGRESS

	// Local state for text inputs (debounced)
	const [remoteApiUrl, setRemoteApiUrl] = useState(config.remoteApiUrl)
	const [remoteApiKey, setRemoteApiKey] = useState(config.remoteApiKey)
	const [remoteModel, setRemoteModel] = useState(config.remoteModel)
	const [maxFileSize, setMaxFileSize] = useState(String(config.maxFileSize))
	const [ignoredPatternsText, setIgnoredPatternsText] = useState(config.ignoredPatterns.join(", "))

	// Sync local state when config from backend changes
	useEffect(() => {
		setRemoteApiUrl(config.remoteApiUrl)
		setRemoteApiKey(config.remoteApiKey)
		setRemoteModel(config.remoteModel)
		setMaxFileSize(String(config.maxFileSize))
		setIgnoredPatternsText(config.ignoredPatterns.join(", "))
	}, [config.remoteApiUrl, config.remoteApiKey, config.remoteModel, config.maxFileSize, config.ignoredPatterns])

	const handleModeChange = useCallback((e: any) => {
		const mode = e.target.value as IndexingMode
		postIndexingConfigKey("mode", mode)
	}, [])

	const handleLocalModelChange = useCallback((e: any) => {
		const modelId = e.target.value as LocalModelId
		postIndexingConfigKey("localModel", modelId)
	}, [])

	const handleRemoteUrlBlur = useCallback(() => {
		postIndexingConfigKey("remoteApiUrl", remoteApiUrl.trim())
	}, [remoteApiUrl])

	const handleRemoteKeyBlur = useCallback(() => {
		postIndexingConfigKey("remoteApiKey", remoteApiKey.trim())
	}, [remoteApiKey])

	const handleRemoteModelBlur = useCallback(() => {
		postIndexingConfigKey("remoteModel", remoteModel.trim())
	}, [remoteModel])

	const handleMaxFileSizeBlur = useCallback(() => {
		const parsed = Number.parseInt(maxFileSize, 10)
		if (!Number.isNaN(parsed) && parsed > 0) {
			postIndexingConfigKey("maxFileSize", parsed)
		}
	}, [maxFileSize])

	const handleIgnoredPatternsBlur = useCallback(() => {
		const patterns = ignoredPatternsText
			.split(",")
			.map((p) => p.trim())
			.filter((p) => p.length > 0)
		postIndexingConfigKey("ignoredPatterns", patterns)
	}, [ignoredPatternsText])

	const isIndexing = progress.status === "indexing"
	const isPaused = progress.status === "paused"
	const isOff = config.mode === "off"
	const isWorking = isIndexing || isPaused

	// File scan progress (Phase 1-3)
	const filePercent = progress.filesTotal > 0 ? Math.round((progress.filesIndexed / progress.filesTotal) * 100) : 0
	// Embedding progress (Phase 4 - the slow part)
	const embedPercent = progress.chunksTotal > 0 ? Math.round((progress.chunksIndexed / progress.chunksTotal) * 100) : 0

	const phase = progress.phase ?? "idle"

	/** Human-readable phase label */
	const phaseLabel = (p: IndexingPhase): string => {
		switch (p) {
			case "walking":
				return t("indexing.phase.walking")
			case "chunking":
				return t("indexing.phase.chunking")
			case "loading_model":
				return t("indexing.phase.loadingModel")
			case "embedding":
				return t("indexing.phase.embedding")
			case "saving":
				return t("indexing.phase.saving")
			default:
				return ""
		}
	}

	return (
		<div>
			{renderSectionHeader("indexing")}

			<Section>
				{/* Mode selector */}
				<div className="mb-4">
					<label className="block text-sm font-medium mb-1">{t("indexing.mode")}</label>
					<VSCodeDropdown onChange={handleModeChange} style={{ width: "100%" }} value={config.mode}>
						<VSCodeOption value="off">{t("indexing.mode.off")}</VSCodeOption>
						<VSCodeOption value="local">{t("indexing.mode.local")}</VSCodeOption>
						<VSCodeOption value="remote">{t("indexing.mode.remote")}</VSCodeOption>
					</VSCodeDropdown>
					<p className="text-xs text-description mt-1">
						{config.mode === "local" && t("indexing.mode.localDescription")}
						{config.mode === "remote" && t("indexing.mode.remoteDescription")}
						{config.mode === "off" && t("indexing.mode.offDescription")}
					</p>
				</div>

				{/* Local model selector */}
				{config.mode === "local" && (
					<div className="mb-4">
						<label className="block text-sm font-medium mb-1">{t("indexing.localModel")}</label>
						<VSCodeDropdown onChange={handleLocalModelChange} style={{ width: "100%" }} value={config.localModel || "mini"}>
							<VSCodeOption value="mini">{t("indexing.localModel.mini")}</VSCodeOption>
							<VSCodeOption value="base">{t("indexing.localModel.base")}</VSCodeOption>
							<VSCodeOption value="large">{t("indexing.localModel.large")}</VSCodeOption>
						</VSCodeDropdown>
						<p className="text-xs text-description mt-1">
							{config.localModel === "base" && t("indexing.localModel.baseDescription")}
							{config.localModel === "large" && t("indexing.localModel.largeDescription")}
							{(!config.localModel || config.localModel === "mini") && t("indexing.localModel.miniDescription")}
						</p>
						{config.localModel && config.localModel !== "mini" && (
							<p className="text-xs mt-1" style={{ color: "var(--vscode-editorWarning-foreground)" }}>
								{t("indexing.localModel.reindexWarning")}
							</p>
						)}
					</div>
				)}

				{/* Remote API settings */}
				{config.mode === "remote" && (
					<div className="mb-4 p-3 border border-panel-border rounded">
						<label className="block text-sm font-medium mb-2">{t("indexing.remoteSettings")}</label>

						<div className="mb-2">
							<label className="block text-xs text-description mb-1">{t("indexing.apiUrl")}</label>
							<VSCodeTextField
								onBlur={handleRemoteUrlBlur}
								onInput={(e: any) => setRemoteApiUrl(e.target.value)}
								placeholder={t("indexing.apiUrlPlaceholder")}
								style={{ width: "100%" }}
								value={remoteApiUrl}
							/>
						</div>

						<div className="mb-2">
							<label className="block text-xs text-description mb-1">{t("indexing.apiKey")}</label>
							<VSCodeTextField
								onBlur={handleRemoteKeyBlur}
								onInput={(e: any) => setRemoteApiKey(e.target.value)}
								placeholder={t("indexing.apiKeyPlaceholder")}
								style={{ width: "100%" }}
								type="password"
								value={remoteApiKey}
							/>
						</div>

						<div>
							<label className="block text-xs text-description mb-1">{t("indexing.model")}</label>
							<VSCodeTextField
								onBlur={handleRemoteModelBlur}
								onInput={(e: any) => setRemoteModel(e.target.value)}
								placeholder={t("indexing.modelPlaceholder")}
								style={{ width: "100%" }}
								value={remoteModel}
							/>
						</div>
					</div>
				)}

				{/* Indexing status */}
				{!isOff && (
					<div className="mb-4">
						<label className="block text-sm font-medium mb-2">{t("indexing.status")}</label>

						{/* Active phase label */}
						{isWorking && (
							<div
								className="flex items-center gap-2 mb-2 text-sm"
								style={{ color: "var(--vscode-progressBar-background)" }}>
								<span className="inline-block animate-spin" style={{ fontSize: "14px" }}>
									&#9696;
								</span>
								<span className="font-medium">{phaseLabel(phase)}</span>
								{isPaused && <span className="text-xs opacity-70">({t("indexing.paused")})</span>}
							</div>
						)}

						{/* Step 1: Files */}
						<div className="mb-3">
							<div className="flex justify-between text-xs text-description mb-1">
								<span>
									{phase === "walking" || phase === "chunking"
										? `1. ${t("indexing.step.filesWalking")}: ${progress.filesIndexed} / ${progress.filesTotal || "?"}`
										: `1. ${t("indexing.step.files")}: ${progress.filesTotal || 0}`}
								</span>
								{progress.filesTotal > 0 && <span>{filePercent}%</span>}
							</div>
							<div
								className="w-full rounded h-1.5 overflow-hidden"
								style={{ backgroundColor: "var(--vscode-editor-background)" }}>
								<div
									className="h-full transition-all duration-300 ease-out"
									style={{
										width: `${filePercent}%`,
										backgroundColor:
											filePercent >= 100
												? "var(--vscode-testing-iconPassed)"
												: "var(--vscode-progressBar-background)",
									}}
								/>
							</div>
							{(phase === "walking" || phase === "chunking") && progress.currentFile && (
								<div className="text-xs opacity-50 mt-0.5 truncate">{progress.currentFile}</div>
							)}
						</div>

						{/* Step 2: Embedding (main progress) */}
						<div className="mb-3">
							<div className="flex justify-between text-xs text-description mb-1">
								<span>
									{phase === "loading_model"
										? `2. ${t("indexing.step.loadingModel")}`
										: phase === "embedding"
											? `2. ${t("indexing.step.embedding")}: ${progress.chunksIndexed} / ${progress.chunksTotal}`
											: phase === "saving" || phase === "done"
												? `2. ${t("indexing.step.embedding")}: ${progress.chunksTotal} ${t("indexing.chunks")}`
												: `2. ${t("indexing.step.embedding")}: ${t("indexing.waiting")}`}
								</span>
								{progress.chunksTotal > 0 && <span>{embedPercent}%</span>}
							</div>
							<div
								className="w-full rounded h-2.5 overflow-hidden"
								style={{ backgroundColor: "var(--vscode-editor-background)" }}>
								<div
									className={`h-full transition-all duration-300 ease-out ${phase === "loading_model" ? "animate-pulse" : ""}`}
									style={{
										width: phase === "loading_model" ? "5%" : `${embedPercent}%`,
										backgroundColor:
											progress.status === "error"
												? "var(--vscode-errorForeground)"
												: embedPercent >= 100
													? "var(--vscode-testing-iconPassed)"
													: "var(--vscode-progressBar-background)",
										...(phase === "loading_model" ? { opacity: 0.6 } : {}),
									}}
								/>
							</div>
						</div>

						{/* Status summary */}
						<div className="text-xs text-description mb-3">
							{progress.status === "idle" && t("indexing.waitingStart")}
							{progress.status === "complete" && (
								<span style={{ color: "var(--vscode-testing-iconPassed)" }}>
									{t("indexing.done")}: {progress.filesIndexed} {t("indexing.files")}, {progress.chunksIndexed}{" "}
									{t("indexing.chunks")}
								</span>
							)}
							{progress.status === "error" && (
								<span style={{ color: "var(--vscode-errorForeground)" }}>
									{t("indexing.error")}: {progress.errorMessage || t("indexing.unknownError")}
								</span>
							)}
							<div className="mt-1 opacity-70">
								{t("indexing.lastIndexed")}:{" "}
								{formatTimestamp(progress.lastIndexedAt, locale === "ru" ? "ru-RU" : "en-US")}
							</div>
						</div>

						{/* Action buttons */}
						<div className="flex gap-2">
							{isIndexing ? (
								<VSCodeButton appearance="secondary" onClick={() => postIndexingCommand("pause")}>
									{t("indexing.pause")}
								</VSCodeButton>
							) : isPaused ? (
								<VSCodeButton onClick={() => postIndexingCommand("resume")}>{t("indexing.resume")}</VSCodeButton>
							) : (
								<VSCodeButton onClick={() => postIndexingCommand("reindex")}>
									{t("indexing.reindex")}
								</VSCodeButton>
							)}
							<VSCodeButton
								appearance="secondary"
								disabled={isIndexing}
								onClick={() => postIndexingCommand("clear")}>
								{t("indexing.clear")}
							</VSCodeButton>
						</div>
					</div>
				)}

				{/* Advanced settings */}
				{!isOff && (
					<div className="mb-2">
						<label className="block text-sm font-medium mb-2">{t("indexing.advanced")}</label>

						<div className="mb-2">
							<label className="block text-xs text-description mb-1">
								{t("indexing.maxFileSize")} ({formatBytes(Number.parseInt(maxFileSize, 10) || 0)})
							</label>
							<VSCodeTextField
								onBlur={handleMaxFileSizeBlur}
								onInput={(e: any) => setMaxFileSize(e.target.value)}
								placeholder="102400"
								style={{ width: "200px" }}
								value={maxFileSize}
							/>
						</div>

						<div>
							<label className="block text-xs text-description mb-1">{t("indexing.ignoredPatterns")}</label>
							<VSCodeTextField
								onBlur={handleIgnoredPatternsBlur}
								onInput={(e: any) => setIgnoredPatternsText(e.target.value)}
								placeholder={t("indexing.ignoredPatternsPlaceholder")}
								style={{ width: "100%" }}
								value={ignoredPatternsText}
							/>
						</div>
					</div>
				)}
			</Section>
		</div>
	)
}

export default IndexingSettingsSection
