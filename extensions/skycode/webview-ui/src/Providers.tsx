import { HeroUIProvider } from "@heroui/react"
import { type ReactNode } from "react"
import { CustomPostHogProvider } from "./CustomPostHogProvider"
import { ExtensionStateContextProvider } from "./context/ExtensionStateContext"
import { PlatformProvider } from "./context/PlatformContext"
import { SkycodeAuthProvider } from "./context/SkycodeAuthContext"
import { I18nProvider } from "./i18n"

export function Providers({ children }: { children: ReactNode }) {
	return (
		<PlatformProvider>
			<ExtensionStateContextProvider>
				<I18nProvider>
					<CustomPostHogProvider>
						<SkycodeAuthProvider>
							<HeroUIProvider>{children}</HeroUIProvider>
						</SkycodeAuthProvider>
					</CustomPostHogProvider>
				</I18nProvider>
			</ExtensionStateContextProvider>
		</PlatformProvider>
	)
}
