package com.yjinhong.localai

import kotlinx.coroutines.flow.Flow
import org.codeshipping.llamakotlin.LlamaModel

class LocalLlm {

    private var model: LlamaModel? = null

    suspend fun load(path: String) {
        model?.close()
        model = LlamaModel.load(path) {
            contextSize = 4096
            batchSize = 512
            threads = 4
            threadsBatch = 4
            temperature = 0.2f
            topP = 0.9f
            topK = 40
            repeatPenalty = 1.08f
            maxTokens = 2048
            seed = -1
            useMmap = true
            useMlock = false
            gpuLayers = 0
        }
    }

    fun generate(request: String): Flow<String> {
        val prompt = """
            You are an expert Python 3 programming assistant running entirely on an Android device.

            The user can write in Chinese or English. Understand both languages.

            Task:
            $request

            Requirements:
            - Produce a complete, runnable Python 3 program.
            - Prefer the Python standard library unless a third-party package is explicitly requested.
            - Include sensible error handling and clear variable names.
            - Do not invent APIs or files that the user did not request.
            - If an assumption is necessary, make the smallest reasonable assumption.
            - Return ONLY Python source code. Do not use Markdown fences.
            - Do not include explanations before or after the code.
        """.trimIndent()

        return requireNotNull(model).generateStream(prompt)
    }

    fun close() {
        model?.close()
        model = null
    }
}
