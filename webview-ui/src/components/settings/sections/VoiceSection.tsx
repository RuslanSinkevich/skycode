import { VSCodeButton, VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { memo, useCallback, useEffect, useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { DictationServiceClient } from "@/services/grpc-client"
import { GIGAAM_MODEL_ID, SUPPORTED_DICTATION_LANGUAGES } from "@shared/DictationSettings"
import type { AudioDevice } from "@shared/DictationSettings"
import { EmptyRequest } from "@shared/proto/index.skycode"
import Section from "../Section"
import { updateSetting } from "../utils/settingsHandlers"

interface VoiceSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

// [SKYCODE] GigaAM v3 (sherpa-onnx) — только для русского; остальные модели — whisper.cpp
const GIGAAM_MODEL = { id: GIGAAM_MODEL_ID, labelKey: "voice.modelGigaam", requiresAuth: false, locked: false }

const WHISPER_MODELS = [
	{ id: "tiny", labelKey: "voice.modelTiny", requiresAuth: false, locked: false },
	{ id: "base", labelKey: "voice.modelBase", requiresAuth: false, locked: false },
	{ id: "small", labelKey: "voice.modelSmall", requiresAuth: false, locked: false },
]

const VoiceSection = ({ renderSectionHeader }: VoiceSectionProps) => {
	const { t } = useI18n()
	const { dictationSettings } = useExtensionState()

	const isReady = dictationSettings?.voiceReady === true
	const isDownloading = dictationSettings?.voiceDownloading === true
	const downloadProgress = dictationSettings?.voiceDownloadProgress ?? 0

	const language = dictationSettings?.dictationLanguage || "ru"
	const gigaamAvailable = dictationSettings?.gigaamAvailable !== false
	// GigaAM предлагаем только для русского языка
	const modelOptions = language === "ru" ? [GIGAAM_MODEL, ...WHISPER_MODELS] : WHISPER_MODELS
	const currentModel = dictationSettings?.whisperModel || "tiny"
	const isGigaAmSelected = currentModel === GIGAAM_MODEL_ID && language === "ru"

	const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
	const [devicesLoading, setDevicesLoading] = useState(false)

	const savedDeviceId = dictationSettings?.audioDeviceId || ""

	const updateDictation = useCallback((updates: Record<string, any>) => {
		updateSetting("dictationSettings", { ...dictationSettings, ...updates })
	}, [dictationSettings])

	const handleDownload = useCallback(() => {
		updateDictation({ voiceDownloading: true })
	}, [updateDictation])

	const handleReinstall = useCallback(() => {
		updateDictation({ voiceReinstall: true, voiceDownloading: true })
	}, [updateDictation])

	const loadAudioDevices = useCallback(async () => {
		setDevicesLoading(true)
		try {
			const result = await DictationServiceClient.listAudioDevices(EmptyRequest.create({}))
			if (result.devices && result.devices.length > 0) {
				setAudioDevices(result.devices.map((d) => ({ id: d.id, name: d.name, isDefault: d.isDefault })))
			} else {
				setAudioDevices([])
			}
		} catch {
			setAudioDevices([])
		} finally {
			setDevicesLoading(false)
		}
	}, [])

	// Load devices when dictation is enabled and voice components are ready
	useEffect(() => {
		if (dictationSettings?.dictationEnabled && isReady) {
			loadAudioDevices()
		}
	}, [dictationSettings?.dictationEnabled, isReady, loadAudioDevices])

	return (
		<div>
			{renderSectionHeader("voice")}
			<Section>
				<div style={{ marginBottom: 20 }}>
					{/* Enable voice input */}
					<div>
						<VSCodeCheckbox
							checked={dictationSettings?.dictationEnabled}
							onChange={(e: any) => {
								updateDictation({ dictationEnabled: e.target.checked === true })
							}}>
							{t("voice.enable")}
						</VSCodeCheckbox>
						<p className="text-xs text-description mt-1">{t("voice.enableDescription")}</p>
					</div>

					{dictationSettings?.dictationEnabled && (
						<>
							{/* Language */}
							<div className="mt-4">
								<label className="text-sm font-medium">{t("voice.language")}</label>
								<VSCodeDropdown
									className="w-full mt-1"
									value={dictationSettings?.dictationLanguage || "ru"}
									onChange={(e: any) => {
										const newLanguage = e.target.value
										// GigaAM — только русский: при смене языка переключаемся на whisper
										if (newLanguage !== "ru" && dictationSettings?.whisperModel === GIGAAM_MODEL_ID) {
											updateDictation({ dictationLanguage: newLanguage, whisperModel: "tiny", voiceReady: false })
										} else {
											updateDictation({ dictationLanguage: newLanguage })
										}
									}}>
									{SUPPORTED_DICTATION_LANGUAGES.map((lang) => (
										<VSCodeOption key={lang.code} value={lang.code}>
											{lang.name}
										</VSCodeOption>
									))}
								</VSCodeDropdown>
								<p className="text-xs text-description mt-1">{t("voice.languageDescription")}</p>
							</div>

							{/* Microphone */}
							<div className="mt-4">
								<div className="flex items-center gap-2">
									<label className="text-sm font-medium">{t("voice.microphone")}</label>
									{isReady && (
										<span
											className={`codicon codicon-refresh cursor-pointer text-description hover:text-foreground ${devicesLoading ? "animate-spin" : ""}`}
											title={t("voice.microphoneRefresh")}
											onClick={() => !devicesLoading && loadAudioDevices()}
										/>
									)}
								</div>
							<select
								className="w-full mt-1"
								value={savedDeviceId}
								disabled={!isReady || devicesLoading}
								onChange={(e) => {
									updateDictation({ audioDeviceId: e.target.value })
								}}
								style={{
									padding: "4px 8px",
									background: "var(--vscode-dropdown-background)",
									color: "var(--vscode-dropdown-foreground)",
									border: "1px solid var(--vscode-dropdown-border)",
									borderRadius: "2px",
									fontSize: "var(--vscode-font-size)",
									fontFamily: "var(--vscode-font-family)",
									outline: "none",
									cursor: isReady && !devicesLoading ? "pointer" : "not-allowed",
									opacity: !isReady || devicesLoading ? 0.5 : 1,
								}}>
								<option value="">
									{devicesLoading ? t("voice.microphoneLoading") : t("voice.microphoneAuto")}
								</option>
							{audioDevices.map((device) => (
								<option key={device.id} value={device.id}>
									{device.name}{device.isDefault ? ` ${t("voice.microphoneSystemDefault")}` : ""}
								</option>
							))}
							{/* If saved device not in loaded list yet — show it so select doesn't reset */}
							{savedDeviceId && audioDevices.length > 0 && !audioDevices.some((d) => d.id === savedDeviceId) ? (
								<option key={savedDeviceId} value={savedDeviceId}>
									{savedDeviceId}
								</option>
							) : null}
							</select>
								<p className="text-xs text-description mt-1">{t("voice.microphoneDescription")}</p>
								{isReady && audioDevices.length === 0 && !devicesLoading && (
									<p className="text-xs text-warning mt-1">{t("voice.microphoneNone")}</p>
								)}
							</div>

							{/* Whisper Model */}
							<div className="mt-4">
								<label className="text-sm font-medium">{t("voice.model")}</label>
								<VSCodeDropdown
									className="w-full mt-1"
									value={isGigaAmSelected ? GIGAAM_MODEL_ID : currentModel === GIGAAM_MODEL_ID ? "tiny" : currentModel}
									onChange={(e: any) => {
										const newModel = e.target.value
										const modelConfig = modelOptions.find((m) => m.id === newModel)
										if (!modelConfig || modelConfig.locked) { return }
										if (newModel !== dictationSettings?.whisperModel) {
											updateDictation({ whisperModel: newModel, voiceReady: false, voiceDownloading: false })
										}
									}}>
									{modelOptions.map((model) => {
										const unavailable = model.id === GIGAAM_MODEL_ID && !gigaamAvailable
										const disabled = model.locked || unavailable
										return (
											<VSCodeOption key={model.id} value={model.id} disabled={disabled}>
												{unavailable ? t("voice.modelGigaamUnavailable") : t(model.labelKey)}
											</VSCodeOption>
										)
									})}
								</VSCodeDropdown>
								<p className="text-xs text-description mt-1">
									{isGigaAmSelected ? t("voice.modelGigaamDescription") : t("voice.modelDescription")}
								</p>
							</div>

							{/* Download / Reinstall button */}
							<div className="mt-4">
								<VSCodeButton
									className="w-full"
									disabled={isDownloading}
									onClick={isReady ? handleReinstall : handleDownload}>
									{isDownloading ? (
										<>
											<span className="codicon codicon-loading animate-spin mr-1.5" />
											{isGigaAmSelected && downloadProgress > 0
												? t("voice.downloadingPercent", { percent: downloadProgress })
												: t("voice.downloading")}
										</>
									) : isReady ? (
										t("voice.reinstallButton")
									) : (
										t("voice.downloadButton")
									)}
								</VSCodeButton>
							</div>

							{/* Note */}
							<p className="text-xs text-description mt-3 opacity-60">{t("voice.downloadNote")}</p>
						</>
					)}
				</div>
			</Section>
		</div>
	)
}

export default memo(VoiceSection)
