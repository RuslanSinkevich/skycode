/**
 * @file Handler file for ONNX Runtime backend.
 *
 * [SKYCODE] Modified: use onnxruntime-node (native CPU backend).
 * We run in VS Code extension host (Node.js), so the native backend
 * is the right choice. onnxruntime-web's WASM backend has path issues
 * on Windows (d: protocol vs file:// URL).
 *
 * @module backends/onnx
 */

import * as ONNX_NODE from "onnxruntime-node";

/** @type {import('onnxruntime-node')} The ONNX runtime module. */
export let ONNX;

export const executionProviders = [
  "cpu",
];

ONNX = ONNX_NODE.default ?? ONNX_NODE;
