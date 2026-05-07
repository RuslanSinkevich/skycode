/** biome-ignore-all lint/complexity/noThisInStatic: In static methods, this refers to the constructor (the subclass that invoked the method) when we want to refer to the subclass serviceName.
 *
 * NOTE: This file imports PLATFORM_CONFIG directly rather than using the PlatformProvider
 * because it contains static utility methods that are called from various contexts,
 * including non-React code. The configuration is compile-time constant, so direct
 * import is safe and ensures the methods work consistently regardless of React context.
 */
import { v4 as uuidv4 } from "uuid"
import { PLATFORM_CONFIG } from "../config/platform.config"

/**
 * Compresses a base64 image to JPEG to reduce size
 */
async function compressImage(dataUri: string): Promise<string> {
	if (dataUri.length <= 60000) {
		return dataUri
	}

	try {
		// Extract mime type and base64 data
		const match = dataUri.match(/^data:([^;]+);base64,(.+)$/)
		if (!match) return dataUri

		const [_, mimeType, base64Data] = match

		// Convert base64 to binary
		const binaryString = atob(base64Data)
		const bytes = new Uint8Array(binaryString.length)
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i)
		}

		// Create image from blob
		const blob = new Blob([bytes], { type: mimeType })
		const bitmap = await createImageBitmap(blob)

		// Calculate new dimensions - aggressively reduce size
		let width = bitmap.width
		let height = bitmap.height
		const targetPixels = 400 * 400 // Max 400x400

		if (width * height > targetPixels) {
			const scale = Math.sqrt(targetPixels / (width * height))
			width = Math.floor(width * scale)
			height = Math.floor(height * scale)
		}

		// Create canvas and draw resized image
		const canvas = new OffscreenCanvas(width, height)
		const ctx = canvas.getContext("2d")!
		ctx.drawImage(bitmap, 0, 0, width, height)
		bitmap.close()

		// Convert to JPEG for actual compression (PNG ignores quality)
		const resultBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.5 })
		const resultBase64 = await new Promise<string>((resolve) => {
			const reader = new FileReader()
			reader.onload = () => resolve(reader.result as string)
			reader.readAsDataURL(resultBlob)
		})

		// Validate output: a non-empty JPEG data URI. Otherwise fall back to original.
		if (!resultBase64.startsWith("data:image/jpeg;base64,") || resultBase64.length < 100) {
			return dataUri
		}

		return resultBase64
	} catch (e) {
		console.warn("[ImageTransfer] Compression failed:", e)
		return dataUri
	}
}

/**
 * Preprocess images - compress large ones to JPEG
 */
async function handleLargeImagesInRequest(request: any): Promise<{ request: any }> {
	const images = request?.images
	if (!images || !Array.isArray(images)) {
		return { request }
	}

	for (let i = 0; i < images.length; i++) {
		if (typeof images[i] === "string" && images[i].length > 60000) {
			images[i] = await compressImage(images[i])
		}
	}

	return { request }
}

export interface Callbacks<TResponse> {
	onResponse: (response: TResponse) => void
	onError: (error: Error) => void
	onComplete: () => void
}

export abstract class ProtoBusClient {
	static serviceName: string

	static async makeUnaryRequest<TRequest, TResponse>(
		methodName: string,
		request: TRequest,
		encodeRequest: (_: TRequest) => unknown,
		decodeResponse: (_: { [key: string]: any }) => TResponse,
	): Promise<TResponse> {
		// Capture for nested closures — do not use `this` inside `new Promise`/listeners
		// (some downlevel outputs use a non-arrow executor and break lexical `this`).
		const serviceName = this.serviceName
		// Preprocess images
		const processed = await handleLargeImagesInRequest(request as any)
		const finalRequest = processed.request

		return new Promise((resolve, reject) => {
			const requestId = uuidv4()

			// Set up one-time listener for this specific request
			const handleResponse = (event: MessageEvent) => {
				const message = event.data
				if (message.type === "grpc_response" && message.grpc_response?.request_id === requestId) {
					// Remove listener once we get our response
					window.removeEventListener("message", handleResponse)
					if (message.grpc_response.message) {
						const response = PLATFORM_CONFIG.decodeMessage(message.grpc_response.message, decodeResponse)
						resolve(response)
					} else if (message.grpc_response.error) {
						reject(new Error(message.grpc_response.error))
					} else {
						reject(new Error(`ProtoBus: ${serviceName}.${methodName} returned empty response`))
					}
				}
			}

			window.addEventListener("message", handleResponse)
			PLATFORM_CONFIG.postMessage({
				type: "grpc_request",
				grpc_request: {
					service: serviceName,
					method: methodName,
					message: PLATFORM_CONFIG.encodeMessage(finalRequest, encodeRequest),
					request_id: requestId,
					is_streaming: false,
				},
			})
		})
	}

	static makeStreamingRequest<TRequest, TResponse>(
		methodName: string,
		request: TRequest,
		encodeRequest: (_: TRequest) => unknown,
		decodeResponse: (_: { [key: string]: any }) => TResponse,
		callbacks: Callbacks<TResponse>,
	): () => void {
		const serviceName = this.serviceName
		const requestId = uuidv4()
		// Set up listener for streaming responses
		const handleResponse = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "grpc_response" && message.grpc_response?.request_id === requestId) {
				if (message.grpc_response.message) {
					// Process streaming message
					const response = PLATFORM_CONFIG.decodeMessage(message.grpc_response.message, decodeResponse)
					callbacks.onResponse(response)
				} else if (message.grpc_response.error) {
					// Handle error
					if (callbacks.onError) {
						callbacks.onError(new Error(message.grpc_response.error))
					}
					// Only remove the event listener on error
					window.removeEventListener("message", handleResponse)
				} else {
					console.error("ProtoBus: streaming message with no response or error:", message)
				}
				if (message.grpc_response.is_streaming === false) {
					if (callbacks.onComplete) {
						callbacks.onComplete()
					}
					// Only remove the event listener when the stream is explicitly ended
					window.removeEventListener("message", handleResponse)
				}
			}
		}
		window.addEventListener("message", handleResponse)
		PLATFORM_CONFIG.postMessage({
			type: "grpc_request",
			grpc_request: {
				service: serviceName,
				method: methodName,
				message: PLATFORM_CONFIG.encodeMessage(request, encodeRequest),
				request_id: requestId,
				is_streaming: true,
			},
		})
		// Return a function to cancel the stream
		return () => {
			window.removeEventListener("message", handleResponse)
			PLATFORM_CONFIG.postMessage({
				type: "grpc_request_cancel",
				grpc_request_cancel: {
					request_id: requestId,
				},
			})
			// cancellation sent
		}
	}
}
