{
  "targets": [
    {
      "target_name": "stata_bridge",
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<!@(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [
        "-fno-exceptions"
      ],
      "cflags_cc!": [
        "-fno-exceptions"
      ],
      "cflags_cc": [
        "-std=c++17"
      ],
      "sources": [
        "src/stata_bridge.cc"
      ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "CLANG_CXX_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "10.15",
            "ONLY_ACTIVE_ARCH": "NO",
            "VALID_ARCHS": "x86_64 arm64",
            "CLANG_ENABLE_MODULES": "YES",
            "GCC_SYMBOLS_PRIVATE_EXTERN": "YES"
          }
        }],
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          }
        }]
      ]
    }
  ]
}
