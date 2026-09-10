import { describe, it, beforeEach, afterEach } from 'mocha'
import 'should'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { DiffSystem } from '../DiffSystem'
import { _addDocument, _clearDocuments, _getDocumentContent } from '@/test/vscode-mock'
import { InMemoryMemento } from '@/test/test-helpers'

/**
 * Reconciliation of pending hunks with git.
 *
 * Covers what happens to inline diffs when HEAD moves — commit, checkout, reset —
 * including moves made outside the editor, which only surface as a git status
 * refresh (no `onDidCommit`).
 */
describe('DiffSystem — git reconciliation', () => {
	let system: DiffSystem
	let tmpDir: string
	let repoRoot: string
	let fileA: string
	let fileB: string
	let memento: InMemoryMemento

	const ORIGINAL = 'line1\nline2\nline3'

	function makeContext(state: InMemoryMemento): any {
		return {
			workspaceState: state,
			globalStorageUri: { fsPath: path.join(tmpDir, 'storage') },
			subscriptions: [],
		}
	}

	/** Minimal stand-in for the vscode.git Repository surface DiffSystem consumes. */
	function fakeRepo(commit: string | undefined, changedFiles: string[] = []): any {
		return {
			rootUri: { fsPath: repoRoot },
			state: { HEAD: commit ? { commit, name: 'main' } : undefined },
			diffBetween: async () => changedFiles.map((f) => ({ uri: { fsPath: f } })),
		}
	}

	/** Observe a HEAD move: the first observation is only a baseline. */
	async function moveHead(from: string | undefined, to: string, changedFiles: string[]): Promise<void> {
		const anySystem = system as any
		anySystem.onRepoStateChanged(fakeRepo(from, changedFiles))
		anySystem.onRepoStateChanged(fakeRepo(to, changedFiles))
		await anySystem.gitReconcileQueue
	}

	/** Apply an edit through DiffSystem and mirror it to disk, like an editor save. */
	async function seedPendingHunk(file: string): Promise<string> {
		_addDocument(file, ORIGINAL)
		fs.writeFileSync(file, ORIGINAL)
		await system.startCheckpoint('test', 1000)
		const hunkId = await system.replaceLines(file, 2, ['line2'], ['REPLACED'])
		fs.writeFileSync(file, _getDocumentContent(file)!)
		return hunkId
	}

	function statusOf(file: string): string {
		return system.getStore().getHunksByFile(file)[0].status
	}

	beforeEach(async () => {
		_clearDocuments()
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skycode-gitsync-test-'))
		repoRoot = path.join(tmpDir, 'repo')
		fs.mkdirSync(repoRoot, { recursive: true })
		fileA = path.join(repoRoot, 'a.ts')
		fileB = path.join(repoRoot, 'b.ts')
		memento = new InMemoryMemento()
		system = new DiffSystem(makeContext(memento))
		await system.initialize(true)
		system.setCurrentTaskId('task-1')
	})

	afterEach(() => {
		system.dispose()
		if (tmpDir) {
			fs.rmSync(tmpDir, { recursive: true, force: true })
		}
	})

	it('treats the first observed HEAD as a baseline, not as a move', async () => {
		await seedPendingHunk(fileA)

		const anySystem = system as any
		anySystem.onRepoStateChanged(fakeRepo('aaaaaaa1', [fileA]))
		await anySystem.gitReconcileQueue

		system.getPendingCount().should.equal(1)
		statusOf(fileA).should.equal('pending')
	})

	it('auto-accepts hunks of a file captured by the new commit', async () => {
		await seedPendingHunk(fileA)

		await moveHead('aaaaaaa1', 'bbbbbbb2', [fileA])

		system.getPendingCount().should.equal(0)
		statusOf(fileA).should.equal('accepted')
		// Accept never touches content — the committed text stays on disk
		fs.readFileSync(fileA, 'utf-8').should.containEql('REPLACED')
	})

	it('leaves hunks pending when the commit touched other files only', async () => {
		await seedPendingHunk(fileA)

		await moveHead('aaaaaaa1', 'bbbbbbb2', [fileB])

		system.getPendingCount().should.equal(1)
		statusOf(fileA).should.equal('pending')
	})

	it('closes hunks without editing the file when git rewrote it', async () => {
		await seedPendingHunk(fileA)
		// checkout / reset replaced the working tree copy
		fs.writeFileSync(fileA, 'content from another branch\n')

		await moveHead('aaaaaaa1', 'bbbbbbb2', [fileA])

		system.getPendingCount().should.equal(0)
		statusOf(fileA).should.equal('rejected')
		// The file git produced must survive untouched
		fs.readFileSync(fileA, 'utf-8').should.equal('content from another branch\n')
	})

	it('ignores repositories that do not contain the pending file', async () => {
		await seedPendingHunk(fileA)

		const anySystem = system as any
		const otherRoot = path.join(tmpDir, 'other-repo')
		const outsideRepo = (commit: string): any => ({
			rootUri: { fsPath: otherRoot },
			state: { HEAD: { commit, name: 'main' } },
			diffBetween: async () => [{ uri: { fsPath: fileA } }],
		})
		anySystem.onRepoStateChanged(outsideRepo('aaaaaaa1'))
		anySystem.onRepoStateChanged(outsideRepo('bbbbbbb2'))
		await anySystem.gitReconcileQueue

		system.getPendingCount().should.equal(1)
		statusOf(fileA).should.equal('pending')
	})

	it('keeps working after a reload: content hashes are restored from state', async () => {
		await seedPendingHunk(fileA)
		system.dispose() // flushes the hash map into workspaceState

		// Same workspace state, fresh instance — as after a window reload
		system = new DiffSystem(makeContext(memento))
		await system.initialize(false)
		system.getPendingCount().should.equal(1)

		await moveHead('aaaaaaa1', 'bbbbbbb2', [fileA])

		system.getPendingCount().should.equal(0)
		statusOf(fileA).should.equal('accepted')
	})

	it('seeds a baseline for pending hunks that were stored without a hash', async () => {
		await seedPendingHunk(fileA)
		system.dispose()

		// Simulate state written before hashes were persisted
		await memento.update('skycode.diffV2.writtenHashes', {})

		system = new DiffSystem(makeContext(memento))
		await system.initialize(false)

		await moveHead('aaaaaaa1', 'bbbbbbb2', [fileA])

		system.getPendingCount().should.equal(0)
		statusOf(fileA).should.equal('accepted')
	})
})
