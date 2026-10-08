import { AutoApprovalSettings } from "@shared/AutoApprovalSettings"
import { useCallback } from "react"
import { updateAutoApproveSettings } from "@/components/chat/auto-approve-menu/AutoApproveSettingsAPI"
import { ActionMetadata } from "@/components/chat/auto-approve-menu/types"
import { useExtensionState } from "@/context/ExtensionStateContext"

export function useAutoApproveActions() {
	const { autoApprovalSettings } = useExtensionState()

	// Check if action is enabled
	const isChecked = useCallback(
		(action: ActionMetadata): boolean => {
			switch (action.id) {
				case "enableNotifications":
					return autoApprovalSettings.enableNotifications
				default:
					return (autoApprovalSettings.actions[action.id] as boolean | undefined) ?? false
			}
		},
		[autoApprovalSettings],
	)

	// Update action state
	const updateAction = useCallback(
		async (action: ActionMetadata, value: boolean) => {
			const actionId = action.id
			const subActionId = action.subAction?.id

			if (actionId === "enableNotifications" || subActionId === "enableNotifications") {
				await updateNotifications(action, value)
				return
			}

			const newActions = {
				...autoApprovalSettings.actions,
				[actionId]: value,
			} as AutoApprovalSettings["actions"]

			if (value === false && subActionId) {
				Object.assign(newActions, { [subActionId]: false })
			}

			if (value === true && action.parentActionId) {
				Object.assign(newActions, { [action.parentActionId]: true })
			}

			await updateAutoApproveSettings({
				...autoApprovalSettings,
				version: (autoApprovalSettings.version ?? 1) + 1,
				actions: newActions,
			})
		},
		[autoApprovalSettings],
	)

	// Update notifications setting
	const updateNotifications = useCallback(
		async (action: ActionMetadata, checked: boolean) => {
			if (action.id === "enableNotifications") {
				await updateAutoApproveSettings({
					...autoApprovalSettings,
					version: (autoApprovalSettings.version ?? 1) + 1,
					enableNotifications: checked,
				})
			}
		},
		[autoApprovalSettings],
	)

	return {
		isChecked,
		updateAction,
		updateNotifications,
	}
}
