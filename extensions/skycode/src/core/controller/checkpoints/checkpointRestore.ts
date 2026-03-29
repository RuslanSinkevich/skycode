// [SKYCODE] TEMPORARILY DISABLED — legacy Cline shadow-git checkpoint system.
// checkpointRestore relied on shadow-git CheckpointTracker. Now no-ops.
// Will be replaced by DiffSystem V2 rollback (rollbackFromMessage).

import { CheckpointRestoreRequest } from "@shared/proto/skycode/checkpoints"
import { Empty } from "@shared/proto/skycode/common"
import { Logger } from "@/shared/services/Logger"
import { Controller } from ".."

export async function checkpointRestore(_controller: Controller, _request: CheckpointRestoreRequest): Promise<Empty> {
	Logger.log("[checkpointRestore] Legacy Cline checkpoint restore is temporarily disabled.")
	return Empty.create({})
}
