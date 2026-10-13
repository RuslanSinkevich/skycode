import { HeroUIProvider } from "@heroui/react"
import { type ReactNode } from "react"
import { ExtensionStateContextProvider } from "./context/ExtensionStateContext"
import { PlatformProvider } from "./context/PlatformContext"
import { I18nProvider } from "./i18n"

export function Providers({ children }: { children: ReactNode }) {
	return (
		<PlatformProvider>
			<ExtensionStateContextProvider>
				<I18nProvider>
					<HeroUIProvider>{children}</HeroUIProvider>
				</I18nProvider>
			</ExtensionStateContextProvider>
		</PlatformProvider>
	)
}
