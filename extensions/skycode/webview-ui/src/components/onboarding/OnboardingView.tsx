import type { ApiProvider, ModelInfo } from "@shared/api"
import { ALL_AUTO_PROVIDER_LABELS, type AutoProviderResult, pickAutoProvider } from "@shared/api-auto-select"
import type { OnboardingModel, OnboardingModelGroup, OpenRouterModelInfo } from "@shared/proto/index.skycode"
import { AlertCircleIcon, CircleCheckIcon, CircleIcon, ListIcon, LoaderCircleIcon, StarIcon, ZapIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import SkycodeLogoWhite from "@/assets/SkycodeLogoWhite"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemHeader, ItemMedia, ItemTitle } from "@/components/ui/item"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"
import { AccountServiceClient, StateServiceClient } from "@/services/grpc-client"
import ApiConfigurationSection from "../settings/sections/ApiConfigurationSection"
import { useApiConfigurationHandlers } from "../settings/utils/useApiConfigurationHandlers"
import {
	getCapabilities,
	getOverviewLabel,
	getPriceRange,
	getSkycodeUIOnboardingGroups,
	getSpeedLabel,
	type OnboardingModelsByGroup,
} from "./data-models"
import { NEW_USER_TYPE, STEP_CONFIG, USER_TYPE_SELECTIONS } from "./data-steps"

type ModelSelectionProps = {
	userType: NEW_USER_TYPE.FREE | NEW_USER_TYPE.POWER
	selectedModelId: string
	onSelectModel: (modelId: string) => void
	onboardingModels: OnboardingModelsByGroup
	models?: Record<string, ModelInfo>
	searchTerm: string
	setSearchTerm: (term: string) => void
}

const ModelSelection = ({
	userType,
	selectedModelId,
	onSelectModel,
	models,
	searchTerm,
	setSearchTerm,
	onboardingModels,
}: ModelSelectionProps) => {
	const { t } = useI18n()
	const modelGroups = onboardingModels[userType === NEW_USER_TYPE.FREE ? "free" : "power"]

	const searchedModels = useMemo(() => {
		if (!models || !searchTerm) {
			return []
		}
		const flattenedModels = modelGroups.flatMap((g) => g.models.map((m) => m.id))
		// Filter out embedding models and already listed models
		const filtered = Object.entries(models).filter(
			([id, _info]) => !id.includes("embedding") && !flattenedModels.includes(id) && id.includes(searchTerm.toLowerCase()),
		)
		return filtered.slice(0, 5) // Return the first 5 models
	}, [models, modelGroups, searchTerm])

	// Model Item Component
	const ModelItem = ({ id, model, isSelected }: { id: string; model: OnboardingModel; isSelected: boolean }) => {
		return (
			<Item
				className={cn("cursor-pointer hover:cursor-pointer", {
					"bg-input-background/80 border border-button-background": isSelected,
				})}
				key={id}
				onClick={() => onSelectModel(id)}
				variant="outline">
				<ItemHeader className="flex flex-col w-full align-baseline">
					<ItemTitle className="flex w-full justify-between">
						<span className="font-semibold">{model.name || id}</span>
						{model.badge ? (
							<Badge variant="info">{model.badge}</Badge>
						) : model.info ? (
							<Badge>{getPriceRange(model.info)}</Badge>
						) : null}
					</ItemTitle>
					{isSelected && model.info && (
						<ItemDescription>
							<span className="text-foreground/70 text-sm">{t("onboarding.support")}: </span>
							<span className="text-foreground text-sm">{getCapabilities(model.info).join(", ")}</span>
						</ItemDescription>
					)}
				</ItemHeader>
				{model.badge && isSelected && (
					<ItemContent className="w-full border-t border-muted-foreground pt-5 text-ellipsis overflow-hidden">
						<div className="flex flex-col gap-3">
							{model.score && (
								<div className="inline-flex gap-1 [&_svg]:stroke-warning [&_svg]:size-3 items-center text-sm">
									<StarIcon />
									<span>{t("onboarding.modelOverview")}: </span>
									<span className="text-foreground/70">{model.score}%</span>
									<span className="text-foreground/70 hidden xs:block">{getOverviewLabel(model.score)}</span>
								</div>
							)}
							<div className="inline-flex gap-1 [&_svg]:stroke-success [&_svg]:size-3 items-center text-sm">
								<ZapIcon />
								<span>{t("onboarding.speed")}: </span>
								<span className="text-foreground/70">{getSpeedLabel(model.latency)}</span>
							</div>
							{model.info && (
								<div className="flex w-full justify-between">
									<div className="inline-flex gap-1 [&_svg]:stroke-foreground [&_svg]:size-3 items-center text-sm">
										<ListIcon />
										<span>{t("provider.context")}: </span>
										<span className="text-foreground/70">{(model?.info.contextWindow || 0) / 1000}k</span>
									</div>
									<Badge>{getPriceRange(model.info)}</Badge>
								</div>
							)}
						</div>
					</ItemContent>
				)}
			</Item>
		)
	}

	return (
		<div className="flex flex-col w-full items-center px-2">
			<div className="flex w-full max-w-lg flex-col gap-6 my-4">
				{modelGroups.map((group) => (
					<div className="flex flex-col gap-3" key={group.group}>
						<h4 className="text-sm font-bold text-foreground/70 uppercase mb-2">{group.group}</h4>
						{group.models.map((model) => (
							<ModelItem id={model.id} isSelected={selectedModelId === model.id} key={model.id} model={model} />
						))}
					</div>
				))}
			</div>

			{/* SEARCH MODEL */}
			<div className="flex w-full max-w-lg flex-col gap-6 my-4 border-t border-muted-foreground">
				<div className="flex flex-col gap-3 mt-6" key="search-results">
					<h4 className="text-sm font-bold text-foreground/70 uppercase mb-2">{t("onboarding.otherOptions")}</h4>
					<Input
						autoFocus={false}
						className="focus-visible:border-button-background"
						onChange={(e) => {
							if (!e.target?.value) {
								onSelectModel("")
							}
							setSearchTerm(e.target.value)
						}}
						onClick={() => onSelectModel("")}
						placeholder={t("onboarding.searchModel")}
						type="search"
						value={searchTerm}
					/>
					<div className="w-full flex flex-col gap-3">
						{searchTerm &&
							searchedModels.map(([id, info]) => {
								const isSelected = selectedModelId === id
								// Convert ModelInfo to OpenRouterModelInfo for OnboardingModel
								const modelInfo: OpenRouterModelInfo = {
									name: info.name,
									maxTokens: info.maxTokens,
									contextWindow: info.contextWindow,
									supportsImages: info.supportsImages,
									supportsPromptCache: info.supportsPromptCache,
									inputPrice: info.inputPrice,
									outputPrice: info.outputPrice,
									cacheWritesPrice: info.cacheWritesPrice,
									cacheReadsPrice: info.cacheReadsPrice,
									description: info.description,
									supportsGlobalEndpoint: info.supportsGlobalEndpoint,
									thinkingConfig: info.thinkingConfig
										? {
												maxBudget: info.thinkingConfig.maxBudget,
												outputPrice: info.thinkingConfig.outputPrice,
												outputPriceTiers: info.thinkingConfig.outputPriceTiers || [],
											}
										: undefined,
									tiers: info.tiers || [],
								}
								const onboardingModel: OnboardingModel = {
									id,
									name: info.name || id,
									info: modelInfo,
									score: 0,
									latency: 0,
									badge: "",
									group: "",
								}
								return <ModelItem id={id} isSelected={isSelected} key={id} model={onboardingModel} />
							})}
						{searchTerm.length > 0 && searchedModels.length === 0 && (
							<p className="px-1 mt-1 text-sm text-foreground/70">
								{t("onboarding.noResultFor")} "{searchTerm}"
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

type UserTypeSelectionProps = {
	userType: NEW_USER_TYPE | undefined
	onSelectUserType: (type: NEW_USER_TYPE) => void
}

const UserTypeSelectionStep = ({ userType, onSelectUserType }: UserTypeSelectionProps) => (
	<div className="flex flex-col w-full items-center">
		<div className="flex w-full max-w-lg flex-col gap-3 my-2">
			{USER_TYPE_SELECTIONS.map((option) => {
				const isSelected = userType === option.type

				return (
					<Item
						className={cn("cursor-pointer hover:cursor-pointer w-full", {
							"bg-input-background/50 border border-input-foreground/30": isSelected,
						})}
						key={option.type}
						onClick={() => onSelectUserType(option.type)}>
						<ItemMedia className="[&_svg]:stroke-button-background" variant="icon">
							{isSelected ? <CircleCheckIcon className="stroke-1.5" /> : <CircleIcon className="stroke-1" />}
						</ItemMedia>
						<ItemContent className="w-full">
							<ItemTitle>{option.title}</ItemTitle>
							<ItemDescription>{option.description}</ItemDescription>
						</ItemContent>
					</Item>
				)
			})}
		</div>
	</div>
)

type ProviderSelectionProps = {
	autoResult: AutoProviderResult
	selectedProvider: ApiProvider
	onSelectProvider: (provider: ApiProvider) => void
}

/**
 * Provider step. Top: the auto-detected suggestion. Below: the full list as override.
 * If auto-detection didn't find anything (reason="default"), the list is expanded by default.
 */
const ProviderSelectionStep = ({ autoResult, selectedProvider, onSelectProvider }: ProviderSelectionProps) => {
	const isOverridden = selectedProvider !== autoResult.provider
	const detected = autoResult.reason !== "default"
	const [showList, setShowList] = useState(!detected || isOverridden)

	const reasonLabel: Record<AutoProviderResult["reason"], string> = {
		auth: "signed in",
		"api-key": "API key found",
		local: "local runtime",
		default: "no key detected",
	}

	return (
		<div className="flex flex-col w-full items-center">
			<div className="flex w-full max-w-lg flex-col gap-3 my-2">
				{detected && (
					<Item className="bg-input-background/50 border border-input-foreground/30 w-full">
						<ItemMedia className="[&_svg]:stroke-button-background" variant="icon">
							<CircleCheckIcon className="stroke-1.5" />
						</ItemMedia>
						<ItemContent className="w-full">
							<ItemTitle className="flex items-center gap-2">
								<span>{autoResult.label}</span>
								<Badge variant="info">auto · {reasonLabel[autoResult.reason]}</Badge>
							</ItemTitle>
							<ItemDescription>
								Selected automatically from your existing settings. Click below to pick a different provider.
							</ItemDescription>
						</ItemContent>
					</Item>
				)}

				{!showList && (
					<Button className="w-full" onClick={() => setShowList(true)} variant="secondary">
						Change provider…
					</Button>
				)}

				{showList && (
					<div className="flex w-full flex-col gap-2">
						{ALL_AUTO_PROVIDER_LABELS.map((option) => {
							const isSelected = selectedProvider === option.provider
							const isAuto = autoResult.provider === option.provider && detected
							return (
								<Item
									className={cn("cursor-pointer hover:cursor-pointer w-full", {
										"bg-input-background/50 border border-input-foreground/30": isSelected,
									})}
									key={option.provider}
									onClick={() => onSelectProvider(option.provider)}>
									<ItemMedia className="[&_svg]:stroke-button-background" variant="icon">
										{isSelected ? (
											<CircleCheckIcon className="stroke-1.5" />
										) : (
											<CircleIcon className="stroke-1" />
										)}
									</ItemMedia>
									<ItemContent className="w-full">
										<ItemTitle className="flex items-center gap-2">
											<span>{option.label}</span>
											{isAuto && <Badge variant="info">auto-detected</Badge>}
										</ItemTitle>
									</ItemContent>
								</Item>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}

type OnboardingStepContentProps = {
	step: number
	userType: NEW_USER_TYPE | undefined
	autoResult: AutoProviderResult
	selectedProvider: ApiProvider
	selectedModelId: string
	onSelectUserType: (type: NEW_USER_TYPE) => void
	onSelectProvider: (provider: ApiProvider) => void
	onSelectModel: (modelId: string) => void
	searchTerm: string
	setSearchTerm: (term: string) => void
	models?: Record<string, ModelInfo>
	onboardingModels: OnboardingModelsByGroup
}

const OnboardingStepContent = ({
	step,
	userType,
	autoResult,
	selectedProvider,
	selectedModelId,
	onSelectUserType,
	onSelectProvider,
	onSelectModel,
	searchTerm,
	setSearchTerm,
	models,
	onboardingModels,
}: OnboardingStepContentProps) => {
	if (step === 0) {
		return <UserTypeSelectionStep onSelectUserType={onSelectUserType} userType={userType} />
	}
	if (step === 1) {
		return (
			<ProviderSelectionStep
				autoResult={autoResult}
				onSelectProvider={onSelectProvider}
				selectedProvider={selectedProvider}
			/>
		)
	}
	// Шаг 3 = "Almost there"
	if (step === 3) {
		return null
	}
	// Шаг 2 = выбор модели или конфигурация
	if (userType === NEW_USER_TYPE.BYOK) {
		return <ApiConfigurationSection />
	}
	// FREE/Power пользователи видят выбор модели
	const currentUserType = userType === NEW_USER_TYPE.FREE ? NEW_USER_TYPE.FREE : NEW_USER_TYPE.POWER
	return (
		<ModelSelection
			models={models}
			onboardingModels={onboardingModels}
			onSelectModel={onSelectModel}
			searchTerm={searchTerm}
			selectedModelId={selectedModelId}
			setSearchTerm={setSearchTerm}
			userType={currentUserType}
		/>
	)
}

const OnboardingView = ({ onboardingModels }: { onboardingModels: OnboardingModelGroup }) => {
	const { t } = useI18n()
	const { handleFieldsChange } = useApiConfigurationHandlers()
	const { apiConfiguration, openRouterModels, hideSettings, hideAccount, setShowWelcome } = useExtensionState()

	// Auto-detect a provider from the user's existing settings (env keys, prior config, account auth).
	// Recomputed only when configuration shape actually changes — UI stays stable while typing.
	const autoResult = useMemo<AutoProviderResult>(() => pickAutoProvider(apiConfiguration), [apiConfiguration])

	const [stepNumber, setStepNumber] = useState(0)
	const [isActionLoading, setIsActionLoading] = useState(false)
	const [userType, setUserType] = useState<NEW_USER_TYPE>(NEW_USER_TYPE.FREE)
	const [selectedProvider, setSelectedProvider] = useState<ApiProvider>(autoResult.provider)

	const [selectedModelId, setSelectedModelId] = useState("")
	const [searchTerm, setSearchTerm] = useState("")

	const models = useMemo(() => getSkycodeUIOnboardingGroups(onboardingModels), [onboardingModels])

	// Keep selection in sync if auto-detection result changes (e.g. user signs in mid-onboarding).
	// Only update if the user hasn't manually overridden yet (i.e. selection still matches previous auto result).
	const lastAutoRef = useRef<ApiProvider>(autoResult.provider)
	useEffect(() => {
		setSelectedProvider((current) => (current === lastAutoRef.current ? autoResult.provider : current))
		lastAutoRef.current = autoResult.provider
	}, [autoResult.provider])

	useEffect(() => {
		setSearchTerm("")
		const userGroup = userType === NEW_USER_TYPE.POWER ? NEW_USER_TYPE.POWER : NEW_USER_TYPE.FREE
		const modelGroup = models[userGroup][0]
		const userGroupInitModel = modelGroup.models[0]
		setSelectedModelId(userGroupInitModel.id)
	}, [userType, models])

	const onUserTypeClick = useCallback((userType: NEW_USER_TYPE) => {
		setUserType(userType)
		const action =
			userType === NEW_USER_TYPE.POWER
				? "power_user_selected"
				: userType === NEW_USER_TYPE.FREE
					? "free_user_selected"
					: "byok_user_selected"
		// User selection is available in step 0 only
		StateServiceClient.captureOnboardingProgress({ step: 0, action })
	}, [])

	const onProviderClick = useCallback((provider: ApiProvider) => {
		setSelectedProvider(provider)
		StateServiceClient.captureOnboardingProgress({ step: 1, action: `provider_${provider}` })
	}, [])

	const onModelClick = useCallback((modelSelected: string) => {
		setSelectedModelId(modelSelected)
		// User selection is available in step 2 only
		StateServiceClient.captureOnboardingProgress({ step: 2, modelSelected, action: "model_selected" })
	}, [])

	const finishOnboarding = useCallback(
		async (updateModelId: boolean, step: number) => {
			const modelSelected = (updateModelId && selectedModelId) || undefined
			if (modelSelected) {
				await handleFieldsChange({
					planModeOpenRouterModelId: selectedModelId,
					actModeOpenRouterModelId: selectedModelId,
					planModeOpenRouterModelInfo: openRouterModels[selectedModelId],
					actModeOpenRouterModelInfo: openRouterModels[selectedModelId],
				})
			}
			// Always set the selected provider
			await handleFieldsChange({
				planModeApiProvider: selectedProvider,
				actModeApiProvider: selectedProvider,
			})
			hideAccount()
			hideSettings()
			const action = "onboarding_completed"
			StateServiceClient.captureOnboardingProgress({ step, modelSelected, action, completed: true })
		},
		[hideAccount, hideSettings, handleFieldsChange, selectedModelId, openRouterModels, selectedProvider],
	)

	const handleFooterAction = useCallback(
		async (action: "signin" | "next" | "back" | "done" | "signup") => {
			switch (action) {
				case "signup":
					setStepNumber(3) // Almost there
					setIsActionLoading(true)
					await AccountServiceClient.accountLoginClicked({})
						.catch(() => {})
						.finally(() => setIsActionLoading(false))
					await finishOnboarding(true, 3)
					break
				case "signin":
					setIsActionLoading(true)
					await AccountServiceClient.accountLoginClicked({})
						.catch(() => {})
						.finally(() => setIsActionLoading(false))
					await finishOnboarding(true, 3)
					break
				case "next":
					StateServiceClient.captureOnboardingProgress({ step: stepNumber + 1 })
					// Для BYOK на шаге 2 (выбор модели) сразу завершаем
					if (stepNumber === 2 && userType === NEW_USER_TYPE.BYOK) {
						await StateServiceClient.setWelcomeViewCompleted({ value: true }).catch(() => {})
						setShowWelcome(false)
						await finishOnboarding(false, 2)
					} else {
						setStepNumber(stepNumber + 1)
					}
					break
				case "back":
					StateServiceClient.captureOnboardingProgress({ step: stepNumber - 1 })
					setStepNumber(Math.max(0, stepNumber - 1))
					break
				case "done":
					await StateServiceClient.setWelcomeViewCompleted({ value: true }).catch(() => {})
					setShowWelcome(false)
					await finishOnboarding(false, stepNumber)
					break
			}
		},
		[stepNumber, finishOnboarding, setShowWelcome, userType],
	)

	const stepDisplayInfo = useMemo(() => {
		// Шаг 0, 1 имеют фиксированный конфиг
		if (stepNumber === 0) {
			return { title: STEP_CONFIG[0].title, description: STEP_CONFIG[0].description, buttons: STEP_CONFIG[0].buttons }
		}
		if (stepNumber === 1) {
			return { title: STEP_CONFIG[1].title, description: STEP_CONFIG[1].description, buttons: STEP_CONFIG[1].buttons }
		}
		if (stepNumber === 3) {
			return { title: STEP_CONFIG[3].title, description: STEP_CONFIG[3].description, buttons: STEP_CONFIG[3].buttons }
		}
		const title = userType ? STEP_CONFIG[userType].title : STEP_CONFIG[0].title
		const buttons = userType ? STEP_CONFIG[userType].buttons : STEP_CONFIG[0].buttons
		return { title, description: null, buttons }
	}, [stepNumber, userType])

	return (
		<div className="fixed inset-0 p-0 flex flex-col w-full">
			<div className="h-full px-5 xs:mx-10 overflow-auto flex flex-col gap-4 items-center justify-center">
				<SkycodeLogoWhite className="size-16 flex-shrink-0" />
				<h2 className="text-lg font-semibold p-0 flex-shrink-0">{stepDisplayInfo.title}</h2>
				{stepNumber === 2 && (
					<div className="flex w-full max-w-lg flex-col gap-6 my-4 items-center ">
						<LoaderCircleIcon className="animate-spin" />
					</div>
				)}
				{stepDisplayInfo.description && (
					<p className="text-foreground text-sm text-center m-0 p-0 flex-shrink-0">{stepDisplayInfo.description}</p>
				)}

				<div className="flex-1 w-full flex max-w-lg overflow-y-auto min-h-0">
					<OnboardingStepContent
						autoResult={autoResult}
						models={openRouterModels}
						onboardingModels={models}
						onSelectModel={onModelClick}
						onSelectProvider={onProviderClick}
						onSelectUserType={onUserTypeClick}
						searchTerm={searchTerm}
						selectedModelId={selectedModelId}
						selectedProvider={selectedProvider}
						setSearchTerm={setSearchTerm}
						step={stepNumber}
						userType={userType}
					/>
				</div>

				<footer className="flex w-full max-w-lg flex-col gap-3 my-2 px-2 overflow-hidden flex-shrink-0">
					{stepDisplayInfo.buttons.map((btn) => (
						<Button
							className={`w-full rounded-xs ${isActionLoading ? "animate-pulse" : ""}`}
							disabled={isActionLoading}
							key={btn.text}
							onClick={() => handleFooterAction(btn.action)}
							variant={btn.variant}>
							{btn.text}
						</Button>
					))}

					{stepNumber !== 3 && (
						<div className="items-center justify-center flex text-sm text-foreground gap-2 mb-3 text-pretty">
							<AlertCircleIcon className="shrink-0 size-2" /> {t("onboarding.changeLaterInSettings")}
						</div>
					)}
				</footer>
			</div>
		</div>
	)
}

export default OnboardingView
