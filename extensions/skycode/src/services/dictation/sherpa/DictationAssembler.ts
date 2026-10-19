// [SKYCODE] Сборка живого текста диктовки: VAD режет речь по паузам, законченные куски распознаются
// и «фиксируются» (committed), а текущий недосказанный кусок пересчитывается каждые ~0,7 с (partial).
// Логика проверена прототипом stream.js; здесь она отделена от нативных библиотек, чтобы её можно было
// тестировать с подставными decode и VAD.

export interface VadLike {
	acceptWaveform(samples: Float32Array): void
	isEmpty(): boolean
	front(): { samples: Float32Array }
	pop(): void
	flush(): void
	/** Идёт ли сейчас речь; если метода нет, считаем что речь есть всегда */
	isDetected?(): boolean
	/** Сброс состояния между записями */
	reset?(): void
}

export type DecodeFn = (samples: Float32Array) => string

export interface DictationUpdate {
	committed: string
	partial: string
}

export interface DictationAssemblerOptions {
	/** Сколько новых сэмплов копить до пересчёта partial (по умолчанию 11200 = 0,7 с при 16 кГц) */
	partialIntervalSamples?: number
	/** Сколько тишины (сэмплов) оставлять в буфере, пока речи нет (по умолчанию 8000 = 0,5 с) */
	silenceKeepSamples?: number
}

export class DictationAssembler {
	private committed: string[] = []
	private pending: Float32Array[] = []
	private pendingLength = 0
	private sinceDecode = 0
	private partial = ""
	private readonly partialInterval: number
	private readonly silenceKeep: number
	private readonly decode: DecodeFn
	private readonly vad: VadLike

	constructor(decode: DecodeFn, vad: VadLike, options: DictationAssemblerOptions = {}) {
		this.decode = decode
		this.vad = vad
		this.partialInterval = options.partialIntervalSamples ?? 11200
		this.silenceKeep = options.silenceKeepSamples ?? 8000
	}

	/** Подаёт очередной кусок аудио. Возвращает обновление, если текст изменился, иначе null */
	push(samples: Float32Array): DictationUpdate | null {
		if (samples.length === 0) {
			return null
		}
		this.pending.push(samples)
		this.pendingLength += samples.length
		this.sinceDecode += samples.length
		this.vad.acceptWaveform(samples)

		let changed = false
		while (!this.vad.isEmpty()) {
			const segment = this.vad.front()
			this.vad.pop()
			const text = this.decode(segment.samples).trim()
			if (text) {
				this.committed.push(text)
			}
			this.clearPending()
			this.partial = ""
			changed = true
		}

		const speech = this.vad.isDetected ? this.vad.isDetected() : true
		if (!speech) {
			// Речи нет — не гоняем распознавание по тишине и не копим её бесконечно
			this.trimPending(this.silenceKeep)
			if (this.partial) {
				this.partial = ""
				changed = true
			}
		} else if (this.sinceDecode >= this.partialInterval && this.pendingLength > 0) {
			this.partial = this.decode(this.joinPending()).trim()
			this.sinceDecode = 0
			changed = true
		}
		return changed ? this.snapshot() : null
	}

	/** Завершает запись: дочитывает хвост из VAD и возвращает итоговый текст */
	finish(): DictationUpdate {
		this.vad.flush()
		while (!this.vad.isEmpty()) {
			const text = this.decode(this.vad.front().samples).trim()
			this.vad.pop()
			if (text) {
				this.committed.push(text)
			}
		}
		this.clearPending()
		this.partial = ""
		return this.snapshot()
	}

	/** Сбрасывает всё состояние для новой записи (воркер живёт между записями) */
	reset(): void {
		this.committed = []
		this.partial = ""
		this.clearPending()
		this.vad.reset?.()
	}

	snapshot(): DictationUpdate {
		return { committed: this.committed.join(" "), partial: this.partial }
	}

	private clearPending(): void {
		this.pending = []
		this.pendingLength = 0
		this.sinceDecode = 0
	}

	private trimPending(keep: number): void {
		if (this.pendingLength <= keep) {
			return
		}
		const all = this.joinPending()
		const tail = all.subarray(all.length - keep)
		this.pending = [tail]
		this.pendingLength = tail.length
	}

	private joinPending(): Float32Array {
		if (this.pending.length === 1) {
			return this.pending[0]
		}
		const all = new Float32Array(this.pendingLength)
		let offset = 0
		for (const piece of this.pending) {
			all.set(piece, offset)
			offset += piece.length
		}
		return all
	}
}
