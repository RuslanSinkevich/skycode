import { Mode } from "@shared/storage/types"
import OpenRouterModelPicker from "../OpenRouterModelPicker"
import { SkycodeAccountInfoCard } from "../SkycodeAccountInfoCard"

/**
 * Props for the SkycodeProvider component
 */
interface SkycodeProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

/**
 * The Skycode provider configuration component
 */
export const SkycodeProvider = ({ showModelOptions, isPopup, currentMode }: SkycodeProviderProps) => {
	return (
		<div>
			{/* Skycode Account Info Card */}
			<div style={{ marginBottom: 14, marginTop: 4 }}>
				<SkycodeAccountInfoCard />
			</div>

			{showModelOptions && (
				<>
					{/* OpenRouter Model Picker - includes Provider Routing in Advanced section */}
					<OpenRouterModelPicker currentMode={currentMode} isPopup={isPopup} showProviderRouting={true} />
				</>
			)}
		</div>
	)
}
