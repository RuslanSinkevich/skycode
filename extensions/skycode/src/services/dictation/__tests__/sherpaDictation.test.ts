import { expect } from "chai"
import { describe, it } from "mocha"
import { DictationAssembler, type VadLike } from "../sherpa/DictationAssembler"
import { Pcm16ToFloat32 } from "../sherpa/pcm"
import {
	computeProgressWeights,
	getFfmpegDownload,
	getRuntimePackages,
	getSherpaPlatformKey,
	GIGAAM_MODEL_ARCHIVE,
	SILERO_VAD,
} from "../sherpa/sherpaDownloads"

describe("getSherpaPlatformKey", () => {
	it("maps supported platforms", () => {
		expect(getSherpaPlatformKey("win32", "x64")).to.equal("win32-x64")
		expect(getSherpaPlatformKey("darwin", "arm64")).to.equal("darwin-arm64")
		expect(getSherpaPlatformKey("darwin", "x64")).to.equal("darwin-x64")
		expect(getSherpaPlatformKey("linux", "x64")).to.equal("linux-x64")
		expect(getSherpaPlatformKey("linux", "arm64")).to.equal("linux-arm64")
	})

	it("returns null for unsupported combinations", () => {
		expect(getSherpaPlatformKey("win32", "ia32")).to.equal(null)
		expect(getSherpaPlatformKey("freebsd", "x64")).to.equal(null)
		expect(getSherpaPlatformKey("win32", "arm64")).to.equal(null)
	})
})

describe("pinned download table", () => {
	const keys = ["win32-x64", "darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"] as const

	it("has wrapper plus native package with sha512 for every platform", () => {
		for (const key of keys) {
			const pkgs = getRuntimePackages(key)
			expect(pkgs).to.have.length(2)
			expect(pkgs[0].name).to.equal("sherpa-onnx-node")
			for (const pkg of pkgs) {
				expect(pkg.download.url).to.equal(`https://registry.npmjs.org/${pkg.name}/-/${pkg.name}-1.13.8.tgz`)
				expect(pkg.download.hashAlgorithm).to.equal("sha512")
				// sha512 в base64 — 88 символов с двумя '=' на конце
				expect(pkg.download.expectedHash).to.have.length(88)
			}
		}
	})

	it("has ffmpeg entries with sha256 for every platform", () => {
		for (const key of keys) {
			const dl = getFfmpegDownload(key)
			expect(dl.url).to.contain(`ffmpeg-${key}.gz`)
			expect(dl.expectedHash).to.match(/^[0-9a-f]{64}$/)
		}
	})

	it("pins model and vad", () => {
		expect(GIGAAM_MODEL_ARCHIVE.sizeBytes).to.equal(170197019)
		expect(GIGAAM_MODEL_ARCHIVE.expectedHash).to.match(/^[0-9a-f]{64}$/)
		expect(SILERO_VAD.sizeBytes).to.equal(643854)
		expect(SILERO_VAD.expectedHash).to.match(/^[0-9a-f]{64}$/)
	})

	it("computes progress weights that sum to one", () => {
		const weights = computeProgressWeights([10, 30, 60])
		expect(weights[0]).to.be.closeTo(0.1, 1e-9)
		expect(weights.reduce((a, b) => a + b, 0)).to.be.closeTo(1, 1e-9)
		expect(computeProgressWeights([0, 0])).to.deep.equal([0, 0])
	})
})

describe("Pcm16ToFloat32", () => {
	const bytes = (...values: number[]) => {
		const buf = Buffer.alloc(values.length * 2)
		for (let i = 0; i < values.length; i++) {
			buf.writeInt16LE(values[i], i * 2)
		}
		return buf
	}

	it("converts whole samples", () => {
		const out = new Pcm16ToFloat32().push(bytes(0, 16384, -16384, -32768))
		expect(Array.from(out)).to.deep.equal([0, 0.5, -0.5, -1])
	})

	it("keeps an odd byte until the next chunk", () => {
		const all = bytes(1000, -2000, 3000)
		const conv = new Pcm16ToFloat32()
		const first = conv.push(all.subarray(0, 3))
		const second = conv.push(all.subarray(3))
		expect(first).to.have.length(1)
		expect(second).to.have.length(2)
		expect(Array.from(first).concat(Array.from(second))).to.deep.equal([1000 / 32768, -2000 / 32768, 3000 / 32768])
	})

	it("survives one-byte chunks", () => {
		const all = bytes(5, -6)
		const conv = new Pcm16ToFloat32()
		const out: number[] = []
		for (const b of all) {
			out.push(...Array.from(conv.push(Buffer.from([b]))))
		}
		expect(out).to.deep.equal([5 / 32768, -6 / 32768])
	})

	it("handles empty chunks and reset", () => {
		const conv = new Pcm16ToFloat32()
		expect(conv.push(Buffer.alloc(0))).to.have.length(0)
		conv.push(Buffer.from([1]))
		conv.reset()
		expect(Array.from(conv.push(bytes(7)))).to.deep.equal([7 / 32768])
	})
})

/** Подставной VAD: выдаёт заранее заданные сегменты после заданного числа поданных сэмплов */
class FakeVad implements VadLike {
	private queue: Float32Array[] = []
	private fed = 0
	detected = true
	flushed = false
	resets = 0
	private readonly segments: { at: number; samples: Float32Array }[]
	constructor(segments: { at: number; samples: Float32Array }[]) {
		this.segments = segments
	}

	acceptWaveform(samples: Float32Array): void {
		this.fed += samples.length
		while (this.segments.length && this.segments[0].at <= this.fed) {
			this.queue.push(this.segments.shift()!.samples)
		}
	}
	isEmpty(): boolean {
		return this.queue.length === 0
	}
	front() {
		return { samples: this.queue[0] }
	}
	pop(): void {
		this.queue.shift()
	}
	flush(): void {
		this.flushed = true
		for (const s of this.segments.splice(0)) {
			this.queue.push(s.samples)
		}
	}
	isDetected(): boolean {
		return this.detected
	}
	reset(): void {
		this.resets++
	}
}

/** decode возвращает «длина:первое значение», чтобы по тексту было видно, что именно распознавали */
const fakeDecode = (samples: Float32Array) => ` t${samples.length}:${samples[0]} `

const block = (n: number, value: number) => new Float32Array(n).fill(value)

describe("DictationAssembler", () => {
	it("emits partial only after the interval and keeps committed empty", () => {
		const vad = new FakeVad([])
		const asm = new DictationAssembler(fakeDecode, vad, { partialIntervalSamples: 300 })
		expect(asm.push(block(100, 1))).to.equal(null)
		expect(asm.push(block(100, 1))).to.equal(null)
		const update = asm.push(block(100, 1))
		expect(update).to.deep.equal({ committed: "", partial: "t300:1" })
	})

	it("commits a VAD segment, clears partial and pending", () => {
		const seg = block(250, 2)
		const vad = new FakeVad([{ at: 200, samples: seg }])
		const asm = new DictationAssembler(fakeDecode, vad, { partialIntervalSamples: 1000 })
		asm.push(block(100, 1))
		const update = asm.push(block(100, 1))
		expect(update).to.deep.equal({ committed: "t250:2", partial: "" })
	})

	it("decodes whole pending buffer for partial after a commit", () => {
		const vad = new FakeVad([{ at: 100, samples: block(100, 5) }])
		const asm = new DictationAssembler(fakeDecode, vad, { partialIntervalSamples: 200 })
		asm.push(block(100, 1)) // сегмент закоммичен, pending очищен
		asm.push(block(100, 7))
		const update = asm.push(block(100, 7))
		expect(update).to.deep.equal({ committed: "t100:5", partial: "t200:7" })
	})

	it("joins committed segments with single spaces and skips empty recognitions", () => {
		const decode = (samples: Float32Array) => (samples[0] === 0 ? "   " : `s${samples[0]}`)
		const vad = new FakeVad([
			{ at: 100, samples: block(10, 1) },
			{ at: 200, samples: block(10, 0) },
			{ at: 300, samples: block(10, 3) },
		])
		const asm = new DictationAssembler(decode, vad, { partialIntervalSamples: 10000 })
		asm.push(block(100, 9))
		asm.push(block(100, 9))
		const update = asm.push(block(100, 9))
		expect(update?.committed).to.equal("s1 s3")
	})

	it("finish flushes the VAD tail and clears partial", () => {
		const vad = new FakeVad([{ at: 10000, samples: block(50, 4) }])
		const asm = new DictationAssembler(fakeDecode, vad, { partialIntervalSamples: 100 })
		asm.push(block(100, 1))
		const final = asm.finish()
		expect(vad.flushed).to.equal(true)
		expect(final).to.deep.equal({ committed: "t50:4", partial: "" })
	})

	it("does not decode silence and trims the pending buffer when no speech is detected", () => {
		const vad = new FakeVad([])
		vad.detected = false
		let calls = 0
		const asm = new DictationAssembler(
			(s) => {
				calls++
				return `n${s.length}`
			},
			vad,
			{ partialIntervalSamples: 100, silenceKeepSamples: 150 },
		)
		for (let i = 0; i < 10; i++) {
			expect(asm.push(block(100, 0))).to.equal(null)
		}
		expect(calls).to.equal(0)
		// речь началась — в partial попадает только удержанный хвост тишины плюс новый звук
		vad.detected = true
		const update = asm.push(block(100, 1))
		expect(update?.partial).to.equal("n250")
	})

	it("clears a stale partial when speech stops without a segment", () => {
		const vad = new FakeVad([])
		const asm = new DictationAssembler(fakeDecode, vad, { partialIntervalSamples: 100 })
		expect(asm.push(block(100, 1))?.partial).to.equal("t100:1")
		vad.detected = false
		expect(asm.push(block(10, 0))).to.deep.equal({ committed: "", partial: "" })
	})

	it("reset starts a fresh recording", () => {
		const vad = new FakeVad([{ at: 100, samples: block(10, 1) }])
		const asm = new DictationAssembler(fakeDecode, vad, { partialIntervalSamples: 10000 })
		asm.push(block(100, 1))
		expect(asm.snapshot().committed).to.equal("t10:1")
		asm.reset()
		expect(asm.snapshot()).to.deep.equal({ committed: "", partial: "" })
		expect(vad.resets).to.equal(1)
	})
})
