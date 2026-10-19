/**
 * [SKYCODE] Воркер диктовки GigaAM v3 на sherpa-onnx.
 *
 * Распознавание одного куска занимает до ~0,5 с, поэтому оно живёт в worker_thread, а не в хосте расширений.
 * Нативный аддон НЕ бандлится: он грузится в рантайме из папки, куда его скачал SherpaLocalService.
 *
 * Сообщения от менеджера:
 *   { type: "init", runtimeDir, modelDir, vadPath, numThreads }
 *   { type: "reset" }                       — начало новой записи
 *   { type: "audio", samples: Float32Array } — 16 кГц mono, передаётся с transfer
 *   { type: "finish" }                      — конец записи
 * Ответы:
 *   { type: "ready" }
 *   { type: "update", committed, partial }
 *   { type: "final", text }
 *   { type: "error", message }
 */
import { createRequire } from "node:module"
import * as path from "node:path"
import { parentPort } from "node:worker_threads"
import { DictationAssembler, type VadLike } from "../sherpa/DictationAssembler"

interface InitMessage {
	type: "init"
	runtimeDir: string
	modelDir: string
	vadPath: string
	numThreads?: number
}

type InMessage = InitMessage | { type: "reset" } | { type: "audio"; samples: Float32Array } | { type: "finish" }

const SAMPLE_RATE = 16000

let assembler: DictationAssembler | null = null

function post(message: unknown): void {
	parentPort?.postMessage(message)
}

function init(msg: InitMessage): void {
	// Аддон лежит не рядом с бандлом, поэтому require создаём от пути внутри runtime/node_modules
	const runtimeRequire = createRequire(path.join(msg.runtimeDir, "node_modules", "noop.js"))
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const sherpa: any = runtimeRequire("sherpa-onnx-node")

	const recognizer = new sherpa.OfflineRecognizer({
		featConfig: { sampleRate: SAMPLE_RATE, featureDim: 64 },
		modelConfig: {
			transducer: {
				encoder: path.join(msg.modelDir, "encoder.int8.onnx"),
				decoder: path.join(msg.modelDir, "decoder.onnx"),
				joiner: path.join(msg.modelDir, "joiner.onnx"),
			},
			tokens: path.join(msg.modelDir, "tokens.txt"),
			modelType: "nemo_transducer",
			numThreads: msg.numThreads ?? 4,
		},
	})
	const vad: VadLike = new sherpa.Vad(
		{
			sileroVad: {
				model: msg.vadPath,
				threshold: 0.5,
				minSilenceDuration: 0.4,
				minSpeechDuration: 0.25,
				windowSize: 512,
				maxSpeechDuration: 20,
			},
			sampleRate: SAMPLE_RATE,
			numThreads: 1,
		},
		60,
	)

	const decode = (samples: Float32Array): string => {
		const stream = recognizer.createStream()
		stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE })
		recognizer.decode(stream)
		return String(recognizer.getResult(stream).text ?? "").trim()
	}

	assembler = new DictationAssembler(decode, vad)
	post({ type: "ready" })
}

function handle(msg: InMessage): void {
	switch (msg.type) {
		case "init":
			init(msg)
			break
		case "reset":
			assembler?.reset()
			break
		case "audio": {
			const update = assembler?.push(msg.samples)
			if (update) {
				post({ type: "update", committed: update.committed, partial: update.partial })
			}
			break
		}
		case "finish": {
			const final = assembler?.finish()
			post({ type: "final", text: final?.committed ?? "" })
			assembler?.reset()
			break
		}
	}
}

parentPort?.on("message", (msg: InMessage) => {
	try {
		handle(msg)
	} catch (err) {
		post({ type: "error", message: err instanceof Error ? err.message : String(err) })
	}
})
