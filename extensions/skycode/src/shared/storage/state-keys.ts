import { AutoApprovalSettings, DEFAULT_AUTO_APPROVAL_SETTINGS } from "@shared/AutoApprovalSettings"
import {
	ApiProvider,
	DEFAULT_API_PROVIDER,
	LiteLLMModelInfo,
	ModelInfo,
	OpenAiCompatibleModelInfo,
} from "@shared/api"
import { BrowserSettings, DEFAULT_BROWSER_SETTINGS } from "@shared/BrowserSettings"
import { SkycodeRulesToggles } from "@shared/skycode-rules"
import { DEFAULT_DICTATION_SETTINGS, DictationSettings } from "@shared/DictationSettings"
import { DEFAULT_FOCUS_CHAIN_SETTINGS, FocusChainSettings } from "@shared/FocusChainSettings"
import { HistoryItem } from "@shared/HistoryItem"
import { DEFAULT_MCP_DISPLAY_MODE, McpDisplayMode } from "@shared/McpDisplayMode"
import { WorkspaceRoot } from "@shared/multi-root/types"
import { Mode, OpenaiReasoningEffort } from "@shared/storage/types"
import { LanguageModelChatSelector } from "vscode"

// ============================================================================
// SINGLE SOURCE OF TRUTH FOR STORAGE KEYS
//
// Property definitions with types, default values, and metadata
// NOTE: When adding a new field, the scripts/generate-state-proto.mjs will be
// executed automatically to regenerate the proto/skycode/state.proto file with the
// new fields once the file is staged and committed.
// ============================================================================

/**
 * Defines the shape of a field definition. Each field must have a `default` value,
 * and optionally can have `isAsync`, `isComputed`, or `transform` metadata.
 *
 * The type casting on `default` (e.g., `true as boolean`) is necessary because
 * TypeScript would otherwise infer the literal type (`true`) instead of the
 * wider type (`boolean`). This ensures the generated interfaces allow any
 * value of that type, not just the default literal.
 */
type FieldDefinition<T> = {
	default: T // The default value for the field with proper type casting using as (e.g., `true as boolean | undefined`)
	isAsync?: boolean
	isComputed?: boolean
	transform?: (value: any) => T
}

type FieldDefinitions = Record<string, FieldDefinition<any>>

const GLOBAL_STATE_FIELDS = {
	lastShownAnnouncementId: { default: undefined as string | undefined },
	taskHistory: { default: [] as HistoryItem[], isAsync: true },
	// [SKYCODE] Открытые вкладки (сессия -> задача) и активная; восстанавливаются при старте в состоянии «остановлена»
	openTabs: { default: [] as Array<{ sessionId: string; taskId: string }> },
	activeTabId: { default: undefined as string | undefined },
	favoritedModelIds: { default: [] as string[] },
	mcpResponsesCollapsed: { default: false as boolean },
	terminalReuseEnabled: { default: true as boolean },
	vscodeTerminalExecutionMode: {
		default: "vscodeTerminal" as "vscodeTerminal" | "backgroundExec",
	},
	isNewUser: { default: true as boolean },
	welcomeViewCompleted: { default: undefined as boolean | undefined },
	mcpDisplayMode: { default: DEFAULT_MCP_DISPLAY_MODE as McpDisplayMode },
	workspaceRoots: { default: undefined as WorkspaceRoot[] | undefined },
	primaryRootIndex: { default: 0 as number },
	multiRootEnabled: { default: false as boolean },
	lastDismissedInfoBannerVersion: { default: 0 as number },
	lastDismissedModelBannerVersion: { default: 0 as number },
	nativeToolCallEnabled: { default: false as boolean },
	dismissedBanners: { default: [] as Array<{ bannerId: string; dismissedAt: number }> },
} satisfies FieldDefinitions

// Fields that map directly to ApiHandlerOptions in @shared/api.ts
const API_HANDLER_SETTINGS_FIELDS = {
	// Global configuration (not mode-specific)
	liteLlmBaseUrl: { default: undefined as string | undefined },
	liteLlmUsePromptCache: { default: undefined as boolean | undefined },
	openAiHeaders: { default: {} as Record<string, string> },
	anthropicBaseUrl: { default: undefined as string | undefined },
	openRouterProviderSorting: { default: undefined as string | undefined },
	claudeCodePath: { default: undefined as string | undefined },
	openAiBaseUrl: { default: undefined as string | undefined },
	ollamaBaseUrl: { default: undefined as string | undefined },
	ollamaApiOptionsCtxNum: { default: undefined as string | undefined },
	lmStudioBaseUrl: { default: undefined as string | undefined },
	lmStudioMaxTokens: { default: undefined as string | undefined },
	geminiBaseUrl: { default: undefined as string | undefined },
	qwenCodeOauthPath: { default: undefined as string | undefined },
	azureApiVersion: { default: undefined as string | undefined },
	azureIdentity: { default: undefined as boolean | undefined },
	qwenApiLine: { default: undefined as string | undefined },
	requestTimeoutMs: { default: undefined as number | undefined },
	gigaChatScope: { default: "GIGACHAT_API_PERS" as string },
	yandexGptFolderId: { default: undefined as string | undefined },

	// Plan mode configurations
	planModeApiModelId: { default: undefined as string | undefined },
	planModeThinkingBudgetTokens: { default: 0 as number | undefined },
	geminiPlanModeThinkingLevel: { default: undefined as string | undefined },
	planModeReasoningEffort: { default: undefined as string | undefined },
	planModeVerbosity: { default: undefined as string | undefined },
	planModeVsCodeLmModelSelector: { default: undefined as LanguageModelChatSelector | undefined },
	planModeOpenRouterModelId: { default: undefined as string | undefined },
	planModeOpenRouterModelInfo: { default: undefined as ModelInfo | undefined },
	planModeOpenAiModelId: { default: undefined as string | undefined },
	planModeOpenAiModelInfo: { default: undefined as OpenAiCompatibleModelInfo | undefined },
	planModeOllamaModelId: { default: undefined as string | undefined },
	planModeLmStudioModelId: { default: undefined as string | undefined },
	planModeLiteLlmModelId: { default: undefined as string | undefined },
	planModeLiteLlmModelInfo: { default: undefined as LiteLLMModelInfo | undefined },

	// Act mode configurations
	actModeApiModelId: { default: undefined as string | undefined },
	actModeThinkingBudgetTokens: { default: 0 as number | undefined },
	geminiActModeThinkingLevel: { default: undefined as string | undefined },
	actModeReasoningEffort: { default: undefined as string | undefined },
	actModeVerbosity: { default: undefined as string | undefined },
	actModeVsCodeLmModelSelector: { default: undefined as LanguageModelChatSelector | undefined },
	actModeOpenRouterModelId: { default: undefined as string | undefined },
	actModeOpenRouterModelInfo: { default: undefined as ModelInfo | undefined },
	actModeOpenAiModelId: { default: undefined as string | undefined },
	actModeOpenAiModelInfo: { default: undefined as OpenAiCompatibleModelInfo | undefined },
	actModeOllamaModelId: { default: undefined as string | undefined },
	actModeLmStudioModelId: { default: undefined as string | undefined },
	actModeLiteLlmModelId: { default: undefined as string | undefined },
	actModeLiteLlmModelInfo: { default: undefined as LiteLLMModelInfo | undefined },

	// Model-specific settings
	planModeApiProvider: { default: DEFAULT_API_PROVIDER as ApiProvider },
	actModeApiProvider: { default: DEFAULT_API_PROVIDER as ApiProvider },

	// Deprecated model settings
	lmStudioModelId: { default: undefined as string | undefined },
} satisfies FieldDefinitions

const USER_SETTINGS_FIELDS = {
	// Settings that are NOT part of ApiHandlerOptions
	autoApprovalSettings: {
		default: DEFAULT_AUTO_APPROVAL_SETTINGS as AutoApprovalSettings,
	},
	globalSkycodeRulesToggles: { default: {} as SkycodeRulesToggles },
	globalWorkflowToggles: { default: {} as SkycodeRulesToggles },
	globalSkillsToggles: { default: {} as Record<string, boolean> },
	browserSettings: {
		default: DEFAULT_BROWSER_SETTINGS as BrowserSettings,
		transform: (v: any) => ({ ...DEFAULT_BROWSER_SETTINGS, ...v }),
	},
	planActSeparateModelsSetting: { default: false as boolean, isComputed: true },
	shellIntegrationTimeout: { default: 4000 as number },
	defaultTerminalProfile: { default: "default" as string },
	terminalOutputLineLimit: { default: 500 as number },
	maxConsecutiveMistakes: { default: 3 as number },
	strictPlanModeEnabled: { default: true as boolean },
	yoloModeToggled: { default: false as boolean },
	useAutoCondense: { default: false as boolean },
	skycodeWebToolsEnabled: { default: false as boolean },
	// allow-any-unicode-next-line
	preferredLanguage: { default: "Russian - Русский" as string },
	alwaysThinkInPreferredLanguage: { default: false as boolean },
	openaiReasoningEffort: { default: "medium" as OpenaiReasoningEffort },
	mode: { default: "act" as Mode },
	dictationSettings: {
		default: DEFAULT_DICTATION_SETTINGS as DictationSettings,
		transform: (v: any) => ({ ...DEFAULT_DICTATION_SETTINGS, ...v }),
	},
	focusChainSettings: { default: DEFAULT_FOCUS_CHAIN_SETTINGS as FocusChainSettings },
	customPrompt: { default: undefined as "compact" | undefined },
	autoCondenseThreshold: { default: 0.75 as number }, // number from 0 to 1
	enableParallelToolCalling: { default: false as boolean },
	backgroundEditEnabled: { default: true as boolean },
	skillsEnabled: { default: false as boolean },
	lightweightMode: { default: false as boolean },

	// Session Budget settings (user-overridable limits per tier).
	// "auto" — auto-detect tier from model id (default).
	// "strong" / "medium" / "weak" — force the chosen preset for ALL models
	// (handy when auto-detect underrates a model).
	// "custom" — use the customMax* values below.
	sessionBudgetMode: { default: "auto" as "auto" | "strong" | "medium" | "weak" | "custom" },
	customMaxToolCallsPerTurn: { default: 80 as number },
	customMaxConsecutiveReadOnlyTools: { default: 12 as number },
	customForceCompactAfterSteps: { default: 40 as number },
} satisfies FieldDefinitions

const SETTINGS_FIELDS = { ...API_HANDLER_SETTINGS_FIELDS, ...USER_SETTINGS_FIELDS }
const GLOBAL_STATE_AND_SETTINGS_FIELDS = { ...GLOBAL_STATE_FIELDS, ...SETTINGS_FIELDS }

// ============================================================================
// SECRET KEYS AND LOCAL STATE - Static definitions
// ============================================================================

// Secret keys used in Api Configuration
const SECRETS_KEYS = [
	"apiKey",
	"openRouterApiKey",
	"openAiApiKey",
	"geminiApiKey",
	"openAiNativeApiKey",
	"ollamaApiKey",
	"deepSeekApiKey",
	"qwenApiKey",
	"qwenWebToken",
	"liteLlmApiKey",
	"gigaChatApiKey",
	"yandexGptApiKey",
	"mcpOAuthSecrets",
] as const

export const LocalStateKeys = [
	"localSkycodeRulesToggles",
	"localCursorRulesToggles",
	"localWindsurfRulesToggles",
	"localAgentsRulesToggles",
	"localSkillsToggles",
	"workflowToggles",
] as const

// ============================================================================
// GENERATED TYPES - Auto-generated from property definitions
// ============================================================================

type ExtractDefault<T> = T extends { default: infer U } ? U : never
type BuildInterface<T extends Record<string, { default: any }>> = { [K in keyof T]: ExtractDefault<T[K]> }

export type GlobalState = BuildInterface<typeof GLOBAL_STATE_FIELDS>
export type Settings = BuildInterface<typeof SETTINGS_FIELDS>
export type ApiHandlerOptionSettings = BuildInterface<typeof API_HANDLER_SETTINGS_FIELDS>
export type ApiHandlerSettings = ApiHandlerOptionSettings & Secrets
export type GlobalStateAndSettings = GlobalState & Settings

// ============================================================================
// TYPE ALIASES
// ============================================================================

export type Secrets = { [K in (typeof SecretKeys)[number]]: string | undefined }
export type LocalState = { [K in (typeof LocalStateKeys)[number]]: SkycodeRulesToggles }
export type SecretKey = (typeof SecretKeys)[number]
export type GlobalStateKey = keyof GlobalState
export type LocalStateKey = keyof LocalState
export type SettingsKey = keyof Settings
export type GlobalStateAndSettingsKey = keyof GlobalStateAndSettings

// ============================================================================
// GENERATED KEYS AND LOOKUP SETS - Auto-generated from property definitions
// ============================================================================

const GlobalStateKeys = new Set(Object.keys(GLOBAL_STATE_FIELDS))
const SettingsKeysSet = new Set(Object.keys(SETTINGS_FIELDS))
const GlobalStateAndSettingsKeySet = new Set(Object.keys(GLOBAL_STATE_AND_SETTINGS_FIELDS))
const ApiHandlerSettingsKeysSet = new Set(Object.keys(API_HANDLER_SETTINGS_FIELDS))

export const SecretKeys = Array.from(SECRETS_KEYS)
export const SettingsKeys = Array.from(SettingsKeysSet) as (keyof Settings)[]
export const ApiHandlerSettingsKeys = Array.from(ApiHandlerSettingsKeysSet) as (keyof ApiHandlerOptionSettings)[]
export const GlobalStateAndSettingKeys = Array.from(GlobalStateAndSettingsKeySet) as GlobalStateAndSettingsKey[]

// GENERATED DEFAULTS - Auto-generated from property definitions
// ============================================================================

export const GLOBAL_STATE_DEFAULTS = extractDefaults(GLOBAL_STATE_FIELDS)
export const SETTINGS_DEFAULTS = extractDefaults(SETTINGS_FIELDS)
export const SETTINGS_TRANSFORMS = extractTransforms(SETTINGS_FIELDS)
export const ASYNC_PROPERTIES = extractMetadata({ ...GLOBAL_STATE_FIELDS, ...SETTINGS_FIELDS }, "isAsync")
export const COMPUTED_PROPERTIES = extractMetadata({ ...GLOBAL_STATE_FIELDS, ...SETTINGS_FIELDS }, "isComputed")

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export const isGlobalStateKey = (key: string): key is GlobalStateKey => GlobalStateKeys.has(key)
export const isSettingsKey = (key: string): key is SettingsKey => SettingsKeysSet.has(key)
export const isSecretKey = (key: string): key is SecretKey => new Set(SECRETS_KEYS).has(key as SecretKey)
export const isLocalStateKey = (key: string): key is LocalStateKey => new Set(LocalStateKeys).has(key as LocalStateKey)

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const isAsyncProperty = (key: string): boolean => ASYNC_PROPERTIES.has(key)
export const isComputedProperty = (key: string): boolean => COMPUTED_PROPERTIES.has(key)

export const getDefaultValue = <K extends GlobalStateAndSettingsKey>(key: K): GlobalStateAndSettings[K] | undefined => {
	return ((GLOBAL_STATE_DEFAULTS as any)[key] ?? (SETTINGS_DEFAULTS as any)[key]) as GlobalStateAndSettings[K] | undefined
}

export const hasTransform = (key: string): boolean => key in SETTINGS_TRANSFORMS
export const applyTransform = <T>(key: string, value: T): T => {
	const transform = SETTINGS_TRANSFORMS[key]
	return transform ? transform(value) : value
}

function extractDefaults<T extends Record<string, any>>(props: T): Partial<BuildInterface<T>> {
	return Object.fromEntries(
		Object.entries(props)
			.map(([key, prop]) => [key, prop.default])
			.filter(([_, value]) => value !== undefined),
	) as Partial<BuildInterface<T>>
}

function extractTransforms<T extends Record<string, any>>(props: T): Record<string, (value: any) => any> {
	return Object.fromEntries(
		Object.entries(props)
			.filter(([_, prop]) => "transform" in prop && prop.transform !== undefined)
			.map(([key, prop]) => [key, prop.transform]),
	)
}

function extractMetadata<T extends Record<string, any>>(props: T, field: string): Set<string> {
	return new Set(
		Object.entries(props)
			.filter(([_, prop]) => field in prop && prop[field] === true)
			.map(([key]) => key),
	)
}
