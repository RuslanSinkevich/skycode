/**
 * [SKYCODE] Страховка от зацикливания модели: один и тот же кусок текста повторяется подряд
 * много раз (в истории задач Qwen писал один абзац до 50 раз, чаще всего в рассуждениях).
 * Проверяем не на каждом кусочке потока, а через каждые CHECK_EVERY новых символов.
 */
const CHECK_EVERY = 1500
const TAIL_LENGTH = 200
const WINDOW = 8000
const MIN_REPEATS = 6
const MIN_DISTINCT_CHARS = 20
const MIN_DISTINCT_WORDS = 4

/** Хвост — повтор короткого узора (таблица, ASCII-арт, «0, 0, 0,», одинаковые короткие строки), а не абзаца */
function isShortPeriodic(tail: string): boolean {
	const maxPeriod = Math.floor(TAIL_LENGTH / 3)
	for (let period = 1; period <= maxPeriod; period++) {
		let periodic = true
		for (let i = 0; i + period < tail.length; i++) {
			if (tail[i] !== tail[i + period]) {
				periodic = false
				break
			}
		}
		if (periodic) {
			return true
		}
	}
	return false
}

/** true — хвост текста встречается в последнем окне (без пересечений) не меньше MIN_REPEATS раз */
export function hasRepetitionLoop(text: string): boolean {
	if (text.length < TAIL_LENGTH * MIN_REPEATS) {
		return false
	}
	const tail = text.slice(-TAIL_LENGTH)
	if (!tail.trim()) {
		return false
	}
	// Однообразный хвост (мало разных символов/слов или короткий период) — форматирование/данные, не зацикливание
	if (new Set(tail).size < MIN_DISTINCT_CHARS) {
		return false
	}
	if (new Set(tail.split(/\s+/).filter(Boolean)).size < MIN_DISTINCT_WORDS) {
		return false
	}
	if (isShortPeriodic(tail)) {
		return false
	}
	const window = text.slice(-WINDOW)
	let count = 0
	let index = window.indexOf(tail)
	while (index !== -1) {
		count++
		if (count >= MIN_REPEATS) {
			return true
		}
		// Без пересечений: иначе короткий период засчитывается много раз подряд
		index = window.indexOf(tail, index + TAIL_LENGTH)
	}
	return false
}

/** Следит за потоком: push() возвращает true, когда пора оборвать ответ */
export class RepetitionLoopDetector {
	private text = ""
	private sinceCheck = 0

	push(delta: string | undefined): boolean {
		if (!delta) {
			return false
		}
		this.text += delta
		if (this.text.length > WINDOW * 2) {
			this.text = this.text.slice(-WINDOW)
		}
		this.sinceCheck += delta.length
		if (this.sinceCheck < CHECK_EVERY) {
			return false
		}
		this.sinceCheck = 0
		return hasRepetitionLoop(this.text)
	}
}

export const REPETITION_LOOP_NOTE =
	"[LOOP] Your previous response started repeating the same text over and over, so it was stopped. Do not repeat yourself: state the single next concrete step in one or two sentences and take it with a tool, or ask the user if you are stuck."
