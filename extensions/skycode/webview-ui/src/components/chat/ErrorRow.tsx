import { SkycodeMessage } from "@shared/ExtensionMessage"
import { memo } from "react"
import CreditLimitError from "@/components/chat/CreditLimitError"
import { Button } from "@/components/ui/button"
import { useSkycodeAuth, useSkycodeSignIn } from "@/context/SkycodeAuthContext"
import { useI18n } from "@/i18n"
import { SkycodeError, SkycodeErrorType } from "../../../../src/services/error/SkycodeError"

const _errorColor = "var(--vscode-errorForeground)"

interface ErrorRowProps {
	message: SkycodeMessage
	errorType: "error" | "mistake_limit_reached" | "diff_error" | "skycodeignore_error"
	apiRequestFailedMessage?: string
	apiReqStreamingFailedMessage?: string
}

const ErrorRow = memo(({ message, errorType, apiRequestFailedMessage, apiReqStreamingFailedMessage }: ErrorRowProps) => {
	const { t } = useI18n()
	const { skycodeUser } = useSkycodeAuth()
	const rawApiError = apiRequestFailedMessage || apiReqStreamingFailedMessage

	const { isLoginLoading, handleSignIn } = useSkycodeSignIn()

	const renderErrorContent = () => {
		switch (errorType) {
			case "error":
			case "mistake_limit_reached":
				// Handle API request errors with special error parsing
				if (rawApiError) {
					// FIXME: SkycodeError parsing should not be applied to non-Skycode providers, but it seems we're using skycodeErrorMessage below in the default error display
					const skycodeError = SkycodeError.parse(rawApiError)
					const errorMessage = skycodeError?._error?.message || skycodeError?.message || rawApiError
					const requestId = skycodeError?._error?.request_id
					const providerId = skycodeError?.providerId || skycodeError?._error?.providerId
					const isSkycodeProvider = providerId === "skycode"
					const errorCode = skycodeError?._error?.code

					if (skycodeError?.isErrorType(SkycodeErrorType.Balance)) {
						const errorDetails = skycodeError._error?.details
						return (
							<CreditLimitError
								buyCreditsUrl={errorDetails?.buy_credits_url}
								currentBalance={errorDetails?.current_balance}
								message={errorDetails?.message}
								totalPromotions={errorDetails?.total_promotions}
								totalSpent={errorDetails?.total_spent}
							/>
						)
					}

					if (skycodeError?.isErrorType(SkycodeErrorType.RateLimit)) {
						return (
							<p className="m-0 whitespace-pre-wrap text-error wrap-anywhere">
								{errorMessage}
								{requestId && (
									<div>
										{t("chat.requestId")}: {requestId}
									</div>
								)}
							</p>
						)
					}

					return (
						<p className="m-0 whitespace-pre-wrap text-error wrap-anywhere flex flex-col gap-3">
							{/* Display the well-formatted error extracted from the SkycodeError instance */}

							<header>
								{providerId && <span className="uppercase">[{providerId}] </span>}
								{errorCode && <span>{errorCode}</span>}
								{errorMessage}
								{requestId && (
									<div>
										{t("chat.requestId")}: {requestId}
									</div>
								)}
							</header>

							{/* Windows Powershell Issue */}
							{errorMessage?.toLowerCase()?.includes("powershell") && (
								<div>
									{t("chat.windowsPowershellIssue")}{" "}
								<a className="underline text-inherit" href="https://skycode-ai.ru/ru/docs/terminal-troubleshooting">
									{t("chat.troubleshootingGuide")}
								</a>
									.
								</div>
							)}

							{/* Display raw API error if different from parsed error message */}
							{errorMessage !== rawApiError && <div>{rawApiError}</div>}

							{/* Display Login button for non-logged in users using the Skycode provider */}
							<div>
								{/* The user is signed in or not using skycode provider */}
								{isSkycodeProvider && !skycodeUser ? (
									<Button className="w-full mb-4" disabled={isLoginLoading} onClick={handleSignIn}>
										{t("chat.signInToSkycode")}
										{isLoginLoading && (
											<span className="ml-1 animate-spin">
												<span className="codicon codicon-refresh"></span>
											</span>
										)}
									</Button>
								) : (
									<span className="mb-4 text-description">({t("chat.clickRetryBelow")})</span>
								)}
							</div>
						</p>
					)
				}

				// Regular error message
				return <p className="m-0 mt-4 whitespace-pre-wrap text-error wrap-anywhere">{message.text}</p>

			case "diff_error":
				return (
					<div className="flex flex-col p-2 rounded text-xs opacity-80 bg-quote text-foreground">
						<div>{t("chat.searchPatternNoMatchRetrying")}</div>
					</div>
				)

			case "skycodeignore_error":
				return (
					<div className="flex flex-col p-2 rounded text-xs opacity-80 bg-quote text-foreground">
						<div>
							{t("chat.skycodeTriedToAccess")} <code>{message.text}</code> {t("chat.blockedBySkycodeignore")}{" "}
							<code>.skycodeignore</code> {t("chat.fileWord")}
						</div>
					</div>
				)

			default:
				return null
		}
	}

	// For diff_error and skycodeignore_error, we don't show the header separately
	if (errorType === "diff_error" || errorType === "skycodeignore_error") {
		return renderErrorContent()
	}

	// For other error types, show header + content
	return renderErrorContent()
})

export default ErrorRow
