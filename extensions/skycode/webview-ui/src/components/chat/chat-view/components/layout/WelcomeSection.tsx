import { BANNER_DATA, BannerAction, BannerActionType, BannerCardData } from "@shared/skycode/banner"
import React, { useCallback, useMemo } from "react"
import BannerCarousel from "@/components/common/BannerCarousel"
import HistoryPreview from "@/components/history/HistoryPreview"
import { useApiConfigurationHandlers } from "@/components/settings/utils/useApiConfigurationHandlers"
import HomeHeader from "@/components/welcome/HomeHeader"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { StateServiceClient, UiServiceClient } from "@/services/grpc-client"
import { convertBannerData } from "@/utils/bannerUtils"
import { getCurrentPlatform } from "@/utils/platformUtils"
import { WelcomeSectionProps } from "../../types/chatTypes"

/**
 * Welcome section shown when there's no active task
 * Includes info banner, announcements, home header, and history preview
 */
export const WelcomeSection: React.FC<WelcomeSectionProps> = ({
	showAnnouncement,
	hideAnnouncement,
	showHistoryView,
	version,
	taskHistory,
}) => {
	const { t } = useI18n()
	const {
		lastDismissedInfoBannerVersion,
		lastDismissedCliBannerVersion,
		lastDismissedModelBannerVersion,
		openRouterModels,
		setShowChatModelSelector,
		navigateToSettings,
		navigateToAccount,
		subagentsEnabled,
		banners,
	} = useExtensionState()
	const { handleFieldsChange } = useApiConfigurationHandlers()

	/**
	 * Check if a banner has been dismissed based on its version
	 */
	const isBannerDismissed = useCallback(
		(bannerId: string): boolean => {
			// !! Do not keep tracking the banner versions like this. !!
			if (bannerId.startsWith("info-banner")) {
				return (lastDismissedInfoBannerVersion ?? 0) >= 1
			}
			if (bannerId.startsWith("new-model")) {
				return (lastDismissedModelBannerVersion ?? 0) >= 1
			}
			if (bannerId.startsWith("cli-")) {
				return (lastDismissedCliBannerVersion ?? 0) >= 1
			}
			return false
		},
		[lastDismissedInfoBannerVersion, lastDismissedModelBannerVersion, lastDismissedCliBannerVersion],
	)

	/**
	 * Banner configuration: local tips only.
	 * BANNER_DATA is kept empty — local tips are built here with t().
	 */
	const bannerConfig = useMemo((): BannerCardData[] => {
		const localBanners: BannerCardData[] = [
			{
				id: "info-banner-v1",
				icon: "zap",
				title: t("banner.sidebarTip.title"),
				description: t("banner.sidebarTip.description"),
			},
			...BANNER_DATA,
		]

		return localBanners.filter((banner) => {
			if (isBannerDismissed(banner.id)) {
				return false
			}

			// There is no Skycode account anymore, so nobody is a signed-in user
			if (banner.isSkycodeUserOnly) {
				return false
			}

			if (banner.platforms && !banner.platforms.includes(getCurrentPlatform())) {
				return false
			}

			return true
		})
	}, [isBannerDismissed, t])

	/**
	 * Action handler - maps action types to actual implementations
	 */
	const handleBannerAction = useCallback(
		(action: BannerAction) => {
			switch (action.action) {
				case BannerActionType.Link:
					if (action.arg) {
						UiServiceClient.openUrl({ value: action.arg }).catch(console.error)
					}
					break

				case BannerActionType.SetModel: {
					const modelId = action.arg || "anthropic/claude-opus-4.5"
					handleFieldsChange({
						planModeOpenRouterModelId: modelId,
						actModeOpenRouterModelId: modelId,
						planModeOpenRouterModelInfo: openRouterModels[modelId],
						actModeOpenRouterModelInfo: openRouterModels[modelId],
						planModeApiProvider: "openrouter",
						actModeApiProvider: "openrouter",
					})
					setTimeout(() => setShowChatModelSelector(true), 10)
					break
				}

				case BannerActionType.ShowAccount:
					navigateToAccount()
					break

			case BannerActionType.ShowApiSettings:
				navigateToSettings("providers")
				break

			case BannerActionType.ShowFeatureSettings:
				navigateToSettings("permissions")
				break

				case BannerActionType.InstallCli:
					StateServiceClient.installSkycodeCli({}).catch((error) =>
						console.error("Failed to initiate CLI installation:", error),
					)
					break

				default:
					console.warn("Unknown banner action:", action.action)
			}
		},
		[handleFieldsChange, openRouterModels, setShowChatModelSelector, navigateToSettings, navigateToAccount],
	)

	/**
	 * Dismissal handler - updates version tracking
	 */
	const handleBannerDismiss = useCallback((bannerId: string) => {
		// !! Do not continue use these version numbers or add new banners that don't have unique IDs. !!
		// Banner versions are **deprecated**. Going forward, we are tracking which banners have
		// been dismissed using the **banner ID**.
		if (bannerId.startsWith("info-banner")) {
			StateServiceClient.updateInfoBannerVersion({ value: 1 }).catch(console.error)
		} else if (bannerId.startsWith("new-model")) {
			StateServiceClient.updateModelBannerVersion({ value: 1 }).catch(console.error)
		} else if (bannerId.startsWith("cli-")) {
			StateServiceClient.updateCliBannerVersion({ value: 1 }).catch(console.error)
		} else {
			// Mark the banner as dismissed by its ID.
			StateServiceClient.dismissBanner({ value: bannerId }).catch(console.error)
		}
	}, [])

	/**
	 * Build array of active banners for carousel
	 * Combines hardcoded banners (bannerConfig) with dynamic banners from extension state
	 */
	const activeBanners = useMemo(() => {
		// Start with the hardcoded banners (bannerConfig)
		const hardcodedBanners = bannerConfig.map((banner) =>
			convertBannerData(banner, {
				onAction: handleBannerAction,
				onDismiss: handleBannerDismiss,
			}),
		)

		// Add banners from extension state (exclude modal-only banners — those are shown as a dialog)
		const extensionStateBanners = (banners ?? [])
			.filter((b) => b.placement !== "modal")
			.map((banner) =>
				convertBannerData(banner, {
					onAction: handleBannerAction,
					onDismiss: handleBannerDismiss,
				}),
			)

		// Combine both sources: extension state banners first, then hardcoded banners
		return [...extensionStateBanners, ...hardcodedBanners]
	}, [bannerConfig, banners, subagentsEnabled, handleBannerAction, handleBannerDismiss])

	return (
		<div className="flex flex-col flex-1 w-full h-full p-0 m-0">
			<div className="overflow-y-auto flex flex-col pb-2.5">
				<HomeHeader />
				<BannerCarousel banners={activeBanners} />
				{taskHistory.length > 0 && <HistoryPreview showHistoryView={showHistoryView} />}
			</div>
		</div>
	)
}
