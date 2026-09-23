package com.yjinhong.localai

import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val llm = LocalLlm()

    var modelPath by mutableStateOf<String?>(null)
        private set

    var loaded by mutableStateOf(false)
        private set

    var loading by mutableStateOf(false)
        private set

    var generating by mutableStateOf(false)
        private set

    var code by mutableStateOf("")
        private set

    var error by mutableStateOf("")
        private set

    fun setModelPath(path: String) {
        modelPath = path
        loaded = false
        error = ""
    }

    fun loadModel() {
        val path = modelPath ?: run {
            error = "Import a GGUF model first."
            return
        }

        loading = true
        error = ""

        viewModelScope.launch {
            runCatching {
                llm.load(path)
            }.onSuccess {
                loaded = true
            }.onFailure {
                loaded = false
                error = "Model load failed: " + (it.message ?: "unknown error")
            }
            loading = false
        }
    }

    fun generate(request: String) {
        if (!loaded || generating) return

        generating = true
        code = ""
        error = ""

        viewModelScope.launch {
            llm.generate(request)
                .catch {
                    error = "Generation failed: " + (it.message ?: "unknown error")
                    generating = false
                }
                .collect { token ->
                    code += token
                }
            generating = false
        }
    }

    fun setCode(value: String) {
        code = value
    }

    fun copyCode() {
        val clipboard =
            getApplication<Application>()
                .getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Python", code))
    }

    override fun onCleared() {
        llm.close()
        super.onCleared()
    }
}
