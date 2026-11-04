import { Empty, EmptyRequest } from "@shared/proto/skycode/common"

export async function shutdown(_request: EmptyRequest): Promise<Empty> {
	// VSCode extensions cannot shutdown the host process (VSCode itself)
	// This is a no-op that just returns success
	return Empty.create({})
}
