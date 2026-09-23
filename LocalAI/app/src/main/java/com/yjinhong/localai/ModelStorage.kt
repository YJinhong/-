package com.yjinhong.localai

import android.content.Context
import android.net.Uri
import java.io.File

class ModelStorage(private val context: Context) {

    fun importModel(uri: Uri): File {
        val dir = File(context.filesDir, "models").apply { mkdirs() }
        val target = File(dir, "model.gguf")

        context.contentResolver.openInputStream(uri).use { input ->
            requireNotNull(input) { "Cannot open the selected model." }
            target.outputStream().use { output ->
                input.copyTo(output, bufferSize = 1024 * 1024)
            }
        }
        return target
    }
}
