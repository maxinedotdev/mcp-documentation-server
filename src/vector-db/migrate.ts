/**
 * Legacy migration shim (disabled).
 *
 * Saga v1 drops JSON-based storage migrations. This module is retained only to
 * avoid stale imports in downstream forks; all operations are no-ops.
 */

export interface MigrationResult {
    success: boolean;
    documentsMigrated: number;
    chunksMigrated: number;
    errors: string[];
}

function disabledResult(message: string): MigrationResult {
    return {
        success: false,
        documentsMigrated: 0,
        chunksMigrated: 0,
        errors: [message]
    };
}

export async function migrateFromJson(): Promise<MigrationResult> {
    return disabledResult("Legacy JSON migration is disabled in Saga v1.");
}

export async function needsMigration(): Promise<boolean> {
    return false;
}

export async function runManualMigration(): Promise<void> {
    throw new Error("Legacy JSON migration is disabled in Saga v1.");
}
