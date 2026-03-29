import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Структура сохранённого pending change
 */
export interface StoredPendingChange {
  id: string;
  fsPath: string;
  lineNumber: number;
  removedLines: string[];
  addedLines: string[];
  timestamp: number;
  checkpointId?: string;
}

/**
 * Статистика изменений для файла
 */
export interface FileChangeStats {
  fsPath: string;
  fileName: string;
  addedCount: number;
  removedCount: number;
  changesCount: number;
}

const STORAGE_KEY = 'skycode.pendingChanges.ui'; // Different key from StateStorage to avoid conflicts

/**
 * Хранилище pending changes в workspaceState
 * Обеспечивает persistence между сессиями VS Code, привязанное к конкретному workspace
 */
export class PendingChangesStorage {
  private static _instance: PendingChangesStorage | null = null;
  private _context: vscode.ExtensionContext | null = null;
  private _onDidChange = new vscode.EventEmitter<void>();

  readonly onDidChange = this._onDidChange.event;

  private constructor() {}

  static getInstance(): PendingChangesStorage {
    if (!PendingChangesStorage._instance) {
      PendingChangesStorage._instance = new PendingChangesStorage();
    }
    return PendingChangesStorage._instance;
  }

  /**
   * Инициализация с контекстом расширения
   */
  initialize(context: vscode.ExtensionContext): void {
    this._context = context;
    console.log('[PendingChangesStorage] Initialized (workspace-scoped)');
  }

  private ensureInitialized(): void {
    if (!this._context) {
      throw new Error('[PendingChangesStorage] Not initialized. Call initialize() first.');
    }
  }

  /**
   * Получить все сохранённые pending changes (для текущего workspace)
   */
  getAll(): StoredPendingChange[] {
    this.ensureInitialized();
    // Используем workspaceState вместо globalState - данные привязаны к workspace
    const data = this._context!.workspaceState.get<StoredPendingChange[]>(STORAGE_KEY, []);
    // Safety check - ensure we always return an array
    if (!Array.isArray(data)) {
      console.warn('[PendingChangesStorage] Invalid data in storage, resetting to empty array');
      this._context!.workspaceState.update(STORAGE_KEY, []);
      return [];
    }
    return data;
  }

  /**
   * Получить pending changes для конкретного файла
   */
  getByFile(fsPath: string): StoredPendingChange[] {
    const all = this.getAll();
    const normalizedPath = fsPath.toLowerCase();
    return all.filter(c => c.fsPath.toLowerCase() === normalizedPath);
  }

  /**
   * Получить pending change по ID
   */
  getById(id: string): StoredPendingChange | undefined {
    return this.getAll().find(c => c.id === id);
  }

  /**
   * Получить pending changes для конкретного checkpoint
   */
  getByCheckpointId(checkpointId: string): StoredPendingChange[] {
    const all = this.getAll();
    return all.filter(c => c.checkpointId === checkpointId);
  }

  /**
   * Добавить новый pending change
   */
  async add(change: StoredPendingChange): Promise<void> {
    this.ensureInitialized();
    const all = this.getAll();

    // Удаляем если уже есть с таким ID
    const filtered = all.filter(c => c.id !== change.id);
    filtered.push(change);

    await this._context!.workspaceState.update(STORAGE_KEY, filtered);
    this._onDidChange.fire();

    console.log('[PendingChangesStorage] Added:', change.id, 'total:', filtered.length);
  }

  /**
   * Удалить pending change по ID
   */
  async remove(id: string): Promise<void> {
    this.ensureInitialized();
    const all = this.getAll();
    const filtered = all.filter(c => c.id !== id);

    if (filtered.length !== all.length) {
      await this._context!.workspaceState.update(STORAGE_KEY, filtered);
      this._onDidChange.fire();
      console.log('[PendingChangesStorage] Removed:', id, 'remaining:', filtered.length);
    }
  }

  /**
   * Удалить все pending changes для файла
   */
  async removeByFile(fsPath: string): Promise<void> {
    this.ensureInitialized();
    const all = this.getAll();
    const normalizedPath = fsPath.toLowerCase();
    const filtered = all.filter(c => c.fsPath.toLowerCase() !== normalizedPath);

    if (filtered.length !== all.length) {
      await this._context!.workspaceState.update(STORAGE_KEY, filtered);
      this._onDidChange.fire();
      console.log('[PendingChangesStorage] Removed all for file:', fsPath);
    }
  }

  /**
   * Очистить все pending changes
   */
  async clear(): Promise<void> {
    this.ensureInitialized();
    await this._context!.workspaceState.update(STORAGE_KEY, []);
    this._onDidChange.fire();
    console.log('[PendingChangesStorage] Cleared all');
  }

  /**
   * Обновить позицию (lineNumber) для pending change
   */
  updatePosition(id: string, newLineNumber: number): void {
    this.ensureInitialized();
    const all = this.getAll();
    const index = all.findIndex(c => c.id === id);

    if (index !== -1) {
      all[index].lineNumber = newLineNumber;
      this._context!.workspaceState.update(STORAGE_KEY, all);
      // Не fire event для позиции - это частое обновление
    }
  }

  /**
   * Получить статистику по файлам
   */
  getFileStats(): FileChangeStats[] {
    const all = this.getAll();
    const statsMap = new Map<string, FileChangeStats>();

    for (const change of all) {
      const key = change.fsPath.toLowerCase();
      let stats = statsMap.get(key);

      if (!stats) {
        stats = {
          fsPath: change.fsPath,
          fileName: path.basename(change.fsPath),
          addedCount: 0,
          removedCount: 0,
          changesCount: 0
        };
        statsMap.set(key, stats);
      }

      stats.addedCount += change.addedLines.length;
      stats.removedCount += change.removedLines.length;
      stats.changesCount += 1;
    }

    return Array.from(statsMap.values()).sort((a, b) =>
      a.fileName.localeCompare(b.fileName)
    );
  }

  /**
   * Получить общую статистику
   */
  getTotalStats(): { files: number; added: number; removed: number } {
    const fileStats = this.getFileStats();
    return {
      files: fileStats.length,
      added: fileStats.reduce((sum, f) => sum + f.addedCount, 0),
      removed: fileStats.reduce((sum, f) => sum + f.removedCount, 0)
    };
  }

  /**
   * Получить список уникальных файлов с pending changes
   */
  getFilesWithChanges(): string[] {
    const all = this.getAll();
    const files = new Set<string>();
    for (const change of all) {
      files.add(change.fsPath);
    }
    return Array.from(files);
  }
}

// Export singleton getter
export function getPendingChangesStorage(): PendingChangesStorage {
  return PendingChangesStorage.getInstance();
}
