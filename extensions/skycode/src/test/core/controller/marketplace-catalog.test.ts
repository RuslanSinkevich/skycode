import { afterEach, beforeEach, describe, it } from "mocha"
import "should"
import { Controller } from "@core/controller"
import type { McpMarketplaceItem } from "@shared/mcp"
import fs from "fs/promises"
import * as sinon from "sinon"
import { HostProvider } from "@/hosts/host-provider"

/**
 * Unit tests for the Controller MCP marketplace catalog: reading the bundled file and normalizing items
 */
describe("Controller Marketplace Catalog", () => {
	let controller: Controller
	let mockContext: any
	let stateManagerStub: sinon.SinonStub
	let mockStateManager: any
	let catalogStub: sinon.SinonStub
	let hostProviderInitialized: boolean = false

	const mockMarketplaceData: McpMarketplaceItem[] = [
		{
			mcpId: "github.com/test/filesystem",
			name: "Filesystem",
			author: "Test",
			description: "File operations",
			githubStars: 100,
			downloadCount: 500,
			tags: ["files"],
			githubUrl: "https://github.com/test/filesystem",
			codiconIcon: "files",
			logoUrl: "",
			category: "filesystem",
			requiresApiKey: false,
			isRecommended: false,
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
			lastGithubSync: "2024-01-01T00:00:00Z",
		},
		{
			mcpId: "github.com/test/database",
			name: "Database",
			author: "Test",
			description: "Database operations",
			githubStars: 200,
			downloadCount: 1000,
			tags: ["db"],
			githubUrl: "https://github.com/test/database",
			codiconIcon: "database",
			logoUrl: "",
			category: "database",
			requiresApiKey: false,
			isRecommended: false,
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
			lastGithubSync: "2024-01-01T00:00:00Z",
		},
		{
			mcpId: "github.com/test/web",
			name: "Web",
			author: "Test",
			description: "Web scraping",
			githubStars: 150,
			downloadCount: 750,
			tags: ["web"],
			githubUrl: "https://github.com/test/web",
			codiconIcon: "globe",
			logoUrl: "",
			category: "web",
			requiresApiKey: false,
			isRecommended: false,
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
			lastGithubSync: "2024-01-01T00:00:00Z",
		},
	]

	beforeEach(() => {
		// Initialize HostProvider if not already done
		if (!HostProvider.isInitialized()) {
			const mockHostBridge: any = {
				workspaceClient: {},
				envClient: {},
				windowClient: {},
				diffClient: {},
			}

			HostProvider.initialize(
				() => null as any, // createWebviewProvider
				() => null as any, // createDiffViewProvider
				() => null as any, // createCommentReviewController
				() => null as any, // createTerminalManager
				mockHostBridge,
				() => {}, // logToChannel
				async () => "http://localhost", // getCallbackUrl
				async () => "", // getBinaryLocation
				"/test/extension", // extensionFsPath
				"/test/storage", // globalStorageFsPath
			)
			hostProviderInitialized = true
		}

		// Mock VSCode context
		mockContext = {
			globalState: {
				get: sinon.stub(),
				update: sinon.stub().resolves(),
			},
			workspaceState: {
				get: sinon.stub(),
				update: sinon.stub().resolves(),
			},
			secrets: {
				get: sinon.stub().resolves(),
				store: sinon.stub().resolves(),
				delete: sinon.stub().resolves(),
			},
			subscriptions: [],
			extensionPath: "/test/path",
			globalStoragePath: "/test/storage",
			globalStorageUri: { fsPath: "/test/storage" },
		}

		// Mock StateManager
		mockStateManager = {
			getApiConfiguration: sinon.stub().returns({}),
			getGlobalStateKey: sinon.stub().returns(undefined),
			getGlobalSettingsKey: sinon.stub().returns(undefined),
			getWorkspaceStateKey: sinon.stub().returns(undefined),
			setGlobalState: sinon.stub(),
			setApiConfiguration: sinon.stub(),
			registerCallbacks: sinon.stub(),
		}

		// Stub StateManager.get() to return our mock
		const StateManager = require("@core/storage/StateManager").StateManager
		stateManagerStub = sinon.stub(StateManager, "get").returns(mockStateManager)

		// The catalog is the bundled assets/mcp-marketplace-catalog.json
		catalogStub = sinon.stub(fs, "readFile").resolves(JSON.stringify(mockMarketplaceData))

		// Create controller instance
		controller = new Controller(mockContext)
	})

	afterEach(() => {
		stateManagerStub.restore()
		catalogStub.restore()

		// Reset HostProvider if we initialized it
		if (hostProviderInitialized) {
			HostProvider.reset()
			hostProviderInitialized = false
		}
	})

	describe("refreshMcpMarketplace", () => {
		it("should return the full catalog", async () => {
			const catalog = await controller.refreshMcpMarketplace(false)

			catalog!.items.should.have.length(3)
			catalog!.items.map((item) => item.mcpId).should.containEql("github.com/test/filesystem")
			catalog!.items.map((item) => item.mcpId).should.containEql("github.com/test/database")
			catalog!.items.map((item) => item.mcpId).should.containEql("github.com/test/web")
		})
	})

	describe("Catalog source", () => {
		it("should read the bundled catalog", async () => {
			await controller.refreshMcpMarketplace(false)

			sinon.assert.calledOnce(catalogStub)
			String(catalogStub.firstCall.args[0]).should.endWith("mcp-marketplace-catalog.json")
		})

		it("should handle read errors gracefully", async () => {
			catalogStub.rejects(new Error("ENOENT"))

			const catalog = await controller.refreshMcpMarketplace(false)

			// Should return undefined on error
			;(catalog === undefined).should.be.true()
		})

		it("should handle an invalid catalog", async () => {
			catalogStub.resolves("null")

			const catalog = await controller.refreshMcpMarketplace(false)

			// Should return undefined on invalid response
			;(catalog === undefined).should.be.true()
		})
	})

	describe("Data normalization", () => {
		it("should normalize missing optional fields to default values", async () => {
			const incompleteData = [
				{
					mcpId: "github.com/test/incomplete",
					name: "Incomplete",
					author: "Test",
					description: "Test",
					githubUrl: "https://github.com/test/incomplete",
					codiconIcon: "file",
					logoUrl: "",
					category: "other",
					requiresApiKey: false,
					isRecommended: false,
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
					lastGithubSync: "2024-01-01T00:00:00Z",
					// Missing githubStars, downloadCount, tags
				},
			]
			catalogStub.resolves(JSON.stringify(incompleteData))

			const catalog = await controller.refreshMcpMarketplace(false)

			catalog!.items.should.have.length(1)
			catalog!.items[0].githubStars.should.equal(0)
			catalog!.items[0].downloadCount.should.equal(0)
			catalog!.items[0].tags.should.be.an.Array()
			catalog!.items[0].tags.should.have.length(0)
		})
	})
})
