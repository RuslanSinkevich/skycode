import { ReactNode, useState } from "react"
import { useI18n } from "@/i18n"
import CollapsibleContent from "./CollapsibleContent"

interface AdvancedBlockProps {
	children: ReactNode
	/** Заголовок блока; по умолчанию «Дополнительно» */
	title?: string
	defaultOpen?: boolean
	testId?: string
}

/**
 * [SKYCODE] Единый сворачиваемый блок «Дополнительно»: редкие настройки прячем под заголовок,
 * основной экран остаётся коротким.
 */
export const AdvancedBlock = ({ children, title, defaultOpen = false, testId }: AdvancedBlockProps) => {
	const { t } = useI18n()
	const [isOpen, setIsOpen] = useState(defaultOpen)

	return (
		<div className="mt-3" data-testid={testId}>
			<button
				aria-expanded={isOpen}
				className="flex items-center cursor-pointer bg-transparent border-0 p-0 text-(--vscode-descriptionForeground) hover:text-(--vscode-foreground)"
				onClick={() => setIsOpen((value) => !value)}
				type="button">
				<span className={`codicon ${isOpen ? "codicon-chevron-down" : "codicon-chevron-right"} mr-1`} />
				<span className="font-bold uppercase text-xs">{title ?? t("settings.advanced.toggle")}</span>
			</button>
			{/* [SKYCODE] Содержимое монтируем только в раскрытом виде: свёрнутые поля не держат подписок и опросов */}
			<CollapsibleContent isOpen={isOpen}>{isOpen && <div className="flex flex-col gap-2.5">{children}</div>}</CollapsibleContent>
		</div>
	)
}

export default AdvancedBlock
