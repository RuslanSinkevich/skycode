import { describe, it } from "mocha"
import "should"
import { SessionManager } from "../SessionManager"

describe("SessionManager", () => {
	it("first created session becomes active, later ones do not", () => {
		const m = new SessionManager()
		m.create("a")
		m.create("b")
		m.activeSessionId!.should.equal("a")
		m.size.should.equal(2)
	})

	it("switchTo changes the active session and throws on unknown id", () => {
		const m = new SessionManager()
		m.create("a")
		m.create("b")
		m.switchTo("b")
		m.currentSession!.id.should.equal("b")
		;(() => m.switchTo("zzz")).should.throw()
	})

	it("removing a non-active session keeps the active one", () => {
		const m = new SessionManager()
		m.create("a")
		m.create("b")
		m.remove("b")
		m.activeSessionId!.should.equal("a")
		m.size.should.equal(1)
	})

	it("removing the active session picks another one, or null when empty", () => {
		const m = new SessionManager()
		m.create("a")
		m.create("b")
		m.remove("a")
		m.activeSessionId!.should.equal("b")
		m.remove("b")
		;(m.activeSessionId === null).should.equal(true)
		;(m.currentSession === null).should.equal(true)
	})
})
