package com.yjinhong.localai

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : ComponentActivity() {

    private lateinit var storage: ModelStorage
    private var selectedModelPath by mutableStateOf<String?>(null)

    private val pickModel =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
            uri?.let {
                try {
                    contentResolver.takePersistableUriPermission(
                        it,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    )
                } catch (_: SecurityException) {
                    // The copied model no longer depends on the source URI.
                }
                selectedModelPath = storage.importModel(it).absolutePath
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        storage = ModelStorage(this)

        setContent {
            val vm: MainViewModel = viewModel()

            if (selectedModelPath != null && vm.modelPath != selectedModelPath) {
                vm.setModelPath(selectedModelPath!!)
            }

            var request by mutableStateOf(
                "用 Python 写一个程序：读取一个 CSV 文件，按年龄分组并计算每组平均值，最后保存为新的 CSV。"
            )

            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text(
                            text = "LocalAI Python",
                            style = MaterialTheme.typography.headlineSmall
                        )

                        Text(
                            text = if (vm.modelPath == null) {
                                "No local GGUF model"
                            } else {
                                "Model: " + vm.modelPath!!.substringAfterLast("/")
                            },
                            style = MaterialTheme.typography.bodySmall
                        )

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = {
                                    pickModel.launch(
                                        arrayOf("application/octet-stream", "*/*")
                                    )
                                }
                            ) {
                                Text("Import GGUF")
                            }

                            OutlinedButton(
                                enabled = vm.modelPath != null && !vm.loading,
                                onClick = vm::loadModel
                            ) {
                                Text(if (vm.loading) "Loading…" else "Load")
                            }
                        }

                        OutlinedTextField(
                            value = request,
                            onValueChange = { request = it },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 4,
                            label = { Text("中文 / English request") },
                            placeholder = {
                                Text("Write a Python program that renames JPG files by date.")
                            }
                        )

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                enabled = vm.loaded &&
                                    request.isNotBlank() &&
                                    !vm.generating,
                                onClick = { vm.generate(request) }
                            ) {
                                Text(
                                    if (vm.generating) "Generating…"
                                    else "Generate Python"
                                )
                            }

                            OutlinedButton(
                                enabled = vm.code.isNotBlank(),
                                onClick = vm::copyCode
                            ) {
                                Text("Copy")
                            }
                        }

                        if (vm.error.isNotBlank()) {
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    text = vm.error,
                                    modifier = Modifier.padding(12.dp),
                                    color = MaterialTheme.colorScheme.error
                                )
                            }
                        }

                        Text(
                            text = "Python output",
                            style = MaterialTheme.typography.titleMedium
                        )

                        OutlinedTextField(
                            value = vm.code,
                            onValueChange = vm::setCode,
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f)
                                .verticalScroll(rememberScrollState()),
                            minLines = 12,
                            label = { Text("Editable Python code") }
                        )

                        Spacer(modifier = Modifier.height(2.dp))

                        Text(
                            text = "Inference runs locally on the phone. No API key is required.",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }
        }
    }
}
