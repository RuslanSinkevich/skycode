import { name, publisher, version } from "../package.json"

// [SKYCODE] Команды и панель всегда под «skycode.*» (как в package.json), даже если имя пакета в Marketplace другое
const prefix = "skycode"

/**
 * List of commands with the name of the extension they are registered under.
 * These should match the command IDs defined in package.json.
 * For Nightly build, the publish script has updated all the commands to use the extension name as prefix.
 * In production, all commands are registered under "skycode" for consistency.
 */
const SkycodeCommands = {
	PlusButton: prefix + ".plusButtonClicked",
	SettingsButton: prefix + ".settingsButtonClicked",
	AccountButton: prefix + ".accountButtonClicked",
	TerminalOutput: prefix + ".addTerminalOutputToChat",
	AddToChat: prefix + ".addToChat",
	FixWithSkycode: prefix + ".fixWithSkycode",
	ExplainCode: prefix + ".explainCode",
	ImproveCode: prefix + ".improveCode",
	FocusChatInput: prefix + ".focusChatInput",
	GenerateCommit: prefix + ".generateGitCommitMessage",
	AbortCommit: prefix + ".abortGitCommitMessage",
	ReconstructTaskHistory: prefix + ".reconstructTaskHistory",
	// Inline Edit
	InlineEdit: prefix + ".inlineEdit",
	// Jupyter Notebook commands
	JupyterGenerateCell: prefix + ".jupyterGenerateCell",
	JupyterExplainCell: prefix + ".jupyterExplainCell",
	JupyterImproveCell: prefix + ".jupyterImproveCell",
}

/**
 * IDs for the views registered by the extension.
 * These should match the name + view IDs defined in package.json.
 */
const SkycodeViewIds = {
	Sidebar: prefix + ".SidebarProvider",
}

/**
 * The registry info for the extension, including its ID, name, version, commands, and views
 * registered for the current host.
 */
export const ExtensionRegistryInfo = {
	id: publisher + "." + name,
	name,
	version,
	publisher,
	commands: SkycodeCommands,
	views: SkycodeViewIds,
}
