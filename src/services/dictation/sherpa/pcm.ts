// [SKYCODE] Преобразование потока PCM s16le из stdout ffmpeg в Float32 для sherpa-onnx.
// Чанки pipe приходят произвольного размера, поэтому нечётный байт переносится в следующий чанк.

export class Pcm16ToFloat32 {
	private carry: number | null = null

	/** Принимает очередной чанк байт, возвращает готовые сэмплы в диапазоне [-1, 1) */
	push(chunk: Uint8Array): Float32Array {
		let offset = 0
		let first: number | null = null
		if (this.carry !== null && chunk.length > 0) {
			first = this.carry
			this.carry = null
			offset = 1
		}
		const bodyBytes = chunk.length - offset
		const pairs = Math.floor(bodyBytes / 2)
		const out = new Float32Array(pairs + (first !== null ? 1 : 0))
		let o = 0
		if (first !== null) {
			out[o++] = toSample(first, chunk[0])
		}
		for (let i = 0; i < pairs; i++) {
			const p = offset + i * 2
			out[o++] = toSample(chunk[p], chunk[p + 1])
		}
		if (bodyBytes % 2 === 1) {
			this.carry = chunk[chunk.length - 1]
		}
		return out
	}

	reset(): void {
		this.carry = null
	}
}

function toSample(lo: number, hi: number): number {
	let v = (hi << 8) | lo
	if (v & 0x8000) {
		v -= 0x10000
	}
	return v / 32768
}
