# LocalAI Python

Android local AI coding assistant.

- Kotlin + Jetpack Compose
- Local GGUF inference through a llama.cpp-based Android library
- Chinese and English requests
- Python code generation
- Copy generated code
- No cloud API for inference

The first version intentionally does not bundle a multi-GB model. Import a GGUF model from device storage.

The inference layer is based on llama.cpp. Official Android documentation:
https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md

V2 will add an on-device Python execution sandbox, syntax highlighting, history, model profiles and performance tuning.
