import type { UsageTransaction as ProtoUsageTransaction } from "@shared/proto/skycode/account"
import type { UsageTransaction as SkycodeAccountUsageTransaction } from "@shared/SkycodeAccount"

export const getMainRole = (roles?: string[]) => {
	if (!roles) {
		return undefined
	}

	if (roles.includes("owner")) {
		return "Owner"
	}
	if (roles.includes("admin")) {
		return "Admin"
	}

	return "Member"
}

export const getSkycodeUris = (base: string, type: "dashboard" | "credits", route?: "account" | "organization") => {
	const dashboard = new URL("dashboard", base)

	if (type === "dashboard") {
		return dashboard
	}

	const credits = new URL("/" + (route ?? "account"), dashboard)
	credits.searchParams.set("tab", "credits")
	credits.searchParams.set("redirect", "true")
	return credits
}

/**
 * Converts a protobuf UsageTransaction to a SkycodeAccount UsageTransaction
 * by adding the missing id and metadata fields
 */
export function convertProtoUsageTransaction(protoTransaction: ProtoUsageTransaction): SkycodeAccountUsageTransaction {
	return {
		...protoTransaction,
		id: protoTransaction.generationId, // Use generationId as the id
		metadata: {
			additionalProp1: "",
			additionalProp2: "",
			additionalProp3: "",
		},
	}
}

/**
 * Converts an array of protobuf UsageTransactions to SkycodeAccount UsageTransactions
 */
export function convertProtoUsageTransactions(protoTransactions: ProtoUsageTransaction[]): SkycodeAccountUsageTransaction[] {
	return protoTransactions.map(convertProtoUsageTransaction)
}
