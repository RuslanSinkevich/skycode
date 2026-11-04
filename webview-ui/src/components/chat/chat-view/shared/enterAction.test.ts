import { describe, expect, it } from "vitest"
import { decideEnterAction } from "./enterAction"

const base = { text: "", queueLength: 0, isAgentWorking: false, menuOpen: false }

describe("decideEnterAction", () => {
	it("отправляет текст, когда агент свободен", () => {
		expect(decideEnterAction({ ...base, text: "привет" })).toBe("send")
	})

	it("ставит текст в очередь, когда агент работает", () => {
		expect(decideEnterAction({ ...base, text: "привет", isAgentWorking: true })).toBe("enqueue")
		expect(decideEnterAction({ ...base, text: "привет", isAgentWorking: true, queueLength: 2 })).toBe("enqueue")
	})

	it("пустой ввод + непустая очередь -> отправить первое из очереди", () => {
		expect(decideEnterAction({ ...base, queueLength: 3, isAgentWorking: true })).toBe("sendQueued")
		expect(decideEnterAction({ ...base, text: "   ", queueLength: 1, isAgentWorking: true })).toBe("sendQueued")
		expect(decideEnterAction({ ...base, queueLength: 1 })).toBe("sendQueued")
	})

	it("пустой ввод и пустая очередь -> ничего", () => {
		expect(decideEnterAction(base)).toBe("none")
		expect(decideEnterAction({ ...base, isAgentWorking: true })).toBe("none")
	})

	it("вложения считаются содержимым", () => {
		expect(decideEnterAction({ ...base, hasAttachments: true, queueLength: 1, isAgentWorking: true })).toBe("enqueue")
		expect(decideEnterAction({ ...base, hasAttachments: true })).toBe("send")
	})

	it("открытое меню забирает Enter себе", () => {
		expect(decideEnterAction({ ...base, text: "/co", menuOpen: true })).toBe("none")
		expect(decideEnterAction({ ...base, queueLength: 2, isAgentWorking: true, menuOpen: true })).toBe("none")
	})
})
