# LocalAI Python

Android local AI coding assistant.

## V1

- Kotlin + Jetpack Compose
- Local GGUF inference through a llama.cpp-based Android library
- Chinese and English requests
- Python code generation
- Copy generated code
- Save generated `.py` files
- No cloud API for inference

The first version intentionally does not bundle a multi-GB model. Import a GGUF model from device storage.

### Model for the first test

Use **Qwen2.5-Coder-1.5B-Instruct Q4_K_M** as the first test model. The official Qwen GGUF repository lists the Q4_K_M file at about 1.12 GB and provides llama.cpp usage instructions.

Official model:
https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF

### How it works

1. Install the debug APK.
2. Download a compatible GGUF model.
3. Tap **Import GGUF**.
4. Tap **Load**.
5. Enter a request in Chinese or English.
6. Tap **Generate Python**.
7. Edit, copy, or save the generated Python source.

Inference is performed locally after the model is imported. The app does not send the prompt to a cloud AI API.

The inference layer is based on llama.cpp. Official Android documentation:
https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md

## V2

- On-device Python execution sandbox
- Syntax highlighting
- Run / Stop / Debug controls
- Conversation history
- Multiple model profiles
- Context/temperature/thread controls
- ARM64 performance tuning
- Optional Vulkan acceleration
