/**
 * stata_bridge.cc - C++ N-API Native Module for Stata CLI Session on macOS
 * Bridges Node.js with Stata C API (libstata-*.dylib) via dlopen/dlsym
 * Author: Zihao Viston Wang | License: MIT
 */

#include <napi.h>
#include <dlfcn.h>
#include <string>
#include <vector>
#include <memory>
#include <thread>
#include <mutex>

static void* g_dylib_handle = nullptr;
static bool g_initialized = false;
static std::mutex g_stata_mutex;

typedef int (*StataSO_Main_t)(int argc, char** argv);
typedef int (*StataSO_Execute_t)(const char* cmd, int echo);
typedef void (*StataSO_ClearOutputBuffer_t)();
typedef char* (*StataSO_GetOutputBuffer_t)();
typedef void (*StataSO_SetBreak_t)();
typedef void (*StataSO_Shutdown_t)();

static StataSO_Main_t g_StataSO_Main = nullptr;
static StataSO_Execute_t g_StataSO_Execute = nullptr;
static StataSO_ClearOutputBuffer_t g_StataSO_ClearOutputBuffer = nullptr;
static StataSO_GetOutputBuffer_t g_StataSO_GetOutputBuffer = nullptr;
static StataSO_SetBreak_t g_StataSO_SetBreak = nullptr;
static StataSO_Shutdown_t g_StataSO_Shutdown = nullptr;

inline bool IsDylibLoaded() { return g_dylib_handle != nullptr; }

inline bool AreFunctionsResolved() {
    return g_StataSO_Main && g_StataSO_Execute && g_StataSO_ClearOutputBuffer &&
           g_StataSO_GetOutputBuffer && g_StataSO_SetBreak && g_StataSO_Shutdown;
}

inline bool IsInitialized() { return g_initialized; }

template<typename T>
T LoadSymbol(void* handle, const char* symbol_name) {
    void* symbol = dlsym(handle, symbol_name);
    return symbol ? reinterpret_cast<T>(symbol) : nullptr;
}

std::string GetDylibError() {
    const char* error = dlerror();
    return error ? std::string(error) : "Unknown error";
}

std::string LoadDylibAndResolveSymbols(const std::string& dylib_path) {
    if (IsDylibLoaded()) {
        dlclose(g_dylib_handle);
        g_dylib_handle = nullptr;
        g_initialized = false;
    }

    g_dylib_handle = dlopen(dylib_path.c_str(), RTLD_LAZY);
    if (!g_dylib_handle) return "Failed to load dylib: " + dylib_path + " - " + GetDylibError();

    g_StataSO_Main = LoadSymbol<StataSO_Main_t>(g_dylib_handle, "StataSO_Main");
    if (!g_StataSO_Main) return "Failed to resolve symbol: StataSO_Main";

    g_StataSO_Execute = LoadSymbol<StataSO_Execute_t>(g_dylib_handle, "StataSO_Execute");
    if (!g_StataSO_Execute) return "Failed to resolve symbol: StataSO_Execute";

    g_StataSO_ClearOutputBuffer = LoadSymbol<StataSO_ClearOutputBuffer_t>(g_dylib_handle, "StataSO_ClearOutputBuffer");
    if (!g_StataSO_ClearOutputBuffer) return "Failed to resolve symbol: StataSO_ClearOutputBuffer";

    g_StataSO_GetOutputBuffer = LoadSymbol<StataSO_GetOutputBuffer_t>(g_dylib_handle, "StataSO_GetOutputBuffer");
    if (!g_StataSO_GetOutputBuffer) return "Failed to resolve symbol: StataSO_GetOutputBuffer";

    g_StataSO_SetBreak = LoadSymbol<StataSO_SetBreak_t>(g_dylib_handle, "StataSO_SetBreak");
    if (!g_StataSO_SetBreak) return "Failed to resolve symbol: StataSO_SetBreak";

    g_StataSO_Shutdown = LoadSymbol<StataSO_Shutdown_t>(g_dylib_handle, "StataSO_Shutdown");
    if (!g_StataSO_Shutdown) return "Failed to resolve symbol: StataSO_Shutdown";

    return "";
}

void UnloadDylib() {
    if (IsDylibLoaded()) {
        dlclose(g_dylib_handle);
        g_dylib_handle = nullptr;
    }
    g_StataSO_Main = nullptr;
    g_StataSO_Execute = nullptr;
    g_StataSO_ClearOutputBuffer = nullptr;
    g_StataSO_GetOutputBuffer = nullptr;
    g_StataSO_SetBreak = nullptr;
    g_StataSO_Shutdown = nullptr;
    g_initialized = false;
}

Napi::Value InitSession(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "InitSession requires dylibPath (string)").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string dylib_path = info[0].As<Napi::String>().Utf8Value();

    bool splash = true;
    if (info.Length() >= 2 && info[1].IsBoolean()) {
        splash = info[1].As<Napi::Boolean>().Value();
    }

    std::string exec_path = "";
    if (info.Length() >= 3 && info[2].IsString()) {
        exec_path = info[2].As<Napi::String>().Utf8Value();
    }
    
    std::string st_home = "";
    if (info.Length() >= 4 && info[3].IsString()) {
        st_home = info[3].As<Napi::String>().Utf8Value();
        setenv("SYSDIR_STATA", st_home.c_str(), 1);
    }

    Napi::Function callback;
    bool has_callback = info.Length() >= 5 && info[4].IsFunction();
    if (has_callback) {
        callback = info[4].As<Napi::Function>();
    }

    std::string error = LoadDylibAndResolveSymbols(dylib_path);
    if (!error.empty()) {
        if (has_callback) {
            callback.Call({Napi::Boolean::New(env, false), Napi::String::New(env, error)});
        }
        return Napi::Boolean::New(env, false);
    }

    std::vector<std::string> args;
    if (splash) {
        args = {"-pyexec", exec_path.empty() ? "" : exec_path};
    } else {
        args = {"", "-q", "-pyexec", exec_path.empty() ? "" : exec_path};
    }

    std::vector<char*> argv;
    for (const auto& arg : args) {
        argv.push_back(const_cast<char*>(arg.c_str()));
    }

    int rc = g_StataSO_Main(static_cast<int>(args.size()), argv.data());

    std::string output_msg = "";
    if (g_StataSO_GetOutputBuffer) {
        char* output_ptr = g_StataSO_GetOutputBuffer();
        if (output_ptr) {
            output_msg = std::string(output_ptr);
        }
    }

    // -7100 means Python integration failed, but Stata might still work for code execution
    // For our use case (Node.js), we don't need Python integration
    if (rc >= 0 || rc == -7100) {
        g_initialized = true;
        std::string status_msg = (rc == -7100) ? 
            "Stata initialized (Python integration skipped for Node.js). " + output_msg :
            output_msg;
        if (has_callback) {
            callback.Call({Napi::Boolean::New(env, true), Napi::String::New(env, status_msg)});
        }
        return Napi::Boolean::New(env, true);
    } else {
        std::string error_msg = "StataSO_Main failed with return code: " + std::to_string(rc);
        if (!output_msg.empty()) {
            error_msg += "\nOutput: " + output_msg;
        }
        if (has_callback) {
            callback.Call({Napi::Boolean::New(env, false), Napi::String::New(env, error_msg)});
        }
        return Napi::Boolean::New(env, false);
    }
}

struct ExecuteContext {
    std::string code;
    int echo;
    int return_code;
    std::string output;
    std::string error;
};

Napi::Value Execute(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Execute requires code (string)").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!IsInitialized() || !AreFunctionsResolved()) {
        Napi::Error::New(env, "Stata session not initialized. Call InitSession first.").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string code = info[0].As<Napi::String>().Utf8Value();

    int echo = 0;
    if (info.Length() >= 2) {
        if (info[1].IsBoolean()) {
            echo = info[1].As<Napi::Boolean>().Value() ? 1 : 0;
        } else if (info[1].IsNumber()) {
            echo = info[1].As<Napi::Number>().Int32Value();
        }
    }

    Napi::Function callback;
    bool has_callback = info.Length() >= 3 && info[2].IsFunction();
    if (has_callback) {
        callback = info[2].As<Napi::Function>();
    }

    Napi::ThreadSafeFunction tsfn;
    if (has_callback) {
        tsfn = Napi::ThreadSafeFunction::New(env, callback, "StataExecuteCallback", 0, 1);
    }

    auto context = std::make_shared<ExecuteContext>();
    context->code = code;
    context->echo = echo;

    std::thread worker([context, tsfn, has_callback]() {
        std::lock_guard<std::mutex> lock(g_stata_mutex);

        if (g_StataSO_ClearOutputBuffer) {
            g_StataSO_ClearOutputBuffer();
        }

        context->return_code = g_StataSO_Execute(context->code.c_str(), context->echo);

        if (g_StataSO_GetOutputBuffer) {
            char* output_ptr = g_StataSO_GetOutputBuffer();
            if (output_ptr) {
                context->output = std::string(output_ptr);
            }
        }

        if (context->return_code != 0) {
            context->error = "StataSO_Execute failed with return code: " + std::to_string(context->return_code);
        }

        if (has_callback) {
            tsfn.NonBlockingCall([context](Napi::Env env, Napi::Function jsCallback) {
                jsCallback.Call({
                    Napi::Number::New(env, context->return_code),
                    Napi::String::New(env, context->output),
                    Napi::String::New(env, context->error)
                });
            });
            tsfn.Release();
        }
    });

    worker.detach();
    return env.Undefined();
}

Napi::Value ExecuteSync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "ExecuteSync requires code (string)").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!IsInitialized() || !AreFunctionsResolved()) {
        Napi::Error::New(env, "Stata session not initialized. Call InitSession first.").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string code = info[0].As<Napi::String>().Utf8Value();

    int echo = 0;
    if (info.Length() >= 2 && info[1].IsBoolean()) {
        echo = info[1].As<Napi::Boolean>().Value() ? 1 : 0;
    }

    std::lock_guard<std::mutex> lock(g_stata_mutex);

    if (g_StataSO_ClearOutputBuffer) {
        g_StataSO_ClearOutputBuffer();
    }

    int return_code = g_StataSO_Execute(code.c_str(), echo);

    std::string output = "";
    if (g_StataSO_GetOutputBuffer) {
        char* output_ptr = g_StataSO_GetOutputBuffer();
        if (output_ptr) {
            output = std::string(output_ptr);
        }
    }

    Napi::Object result = Napi::Object::New(env);
    result.Set("returnCode", Napi::Number::New(env, return_code));
    result.Set("output", Napi::String::New(env, output));
    result.Set("error", Napi::String::New(env, return_code != 0 ?
        "StataSO_Execute failed with return code: " + std::to_string(return_code) : ""));

    return result;
}

Napi::Value ClearOutput(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!IsInitialized() || !AreFunctionsResolved()) {
        Napi::Error::New(env, "Stata session not initialized.").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::lock_guard<std::mutex> lock(g_stata_mutex);
    if (g_StataSO_ClearOutputBuffer) {
        g_StataSO_ClearOutputBuffer();
    }

    return Napi::Boolean::New(env, true);
}

Napi::Value GetOutput(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!IsInitialized() || !AreFunctionsResolved()) {
        Napi::Error::New(env, "Stata session not initialized.").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::lock_guard<std::mutex> lock(g_stata_mutex);

    std::string output = "";
    if (g_StataSO_GetOutputBuffer) {
        char* output_ptr = g_StataSO_GetOutputBuffer();
        if (output_ptr) {
            output = std::string(output_ptr);
        }
    }

    return Napi::String::New(env, output);
}

Napi::Value SetBreak(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!IsInitialized() || !AreFunctionsResolved()) {
        Napi::Error::New(env, "Stata session not initialized.").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (g_StataSO_SetBreak) {
        g_StataSO_SetBreak();
    }

    return Napi::Boolean::New(env, true);
}

Napi::Value Shutdown(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!IsInitialized()) {
        return Napi::Boolean::New(env, true);
    }

    std::lock_guard<std::mutex> lock(g_stata_mutex);

    if (g_StataSO_Shutdown && IsInitialized()) {
        g_StataSO_Shutdown();
    }

    UnloadDylib();
    g_initialized = false;

    return Napi::Boolean::New(env, true);
}

Napi::Value IsInitializedJS(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), IsInitialized());
}

Napi::Value IsDylibLoadedJS(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), IsDylibLoaded() && AreFunctionsResolved());
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("initSession", Napi::Function::New(env, InitSession));
    exports.Set("execute", Napi::Function::New(env, Execute));
    exports.Set("executeSync", Napi::Function::New(env, ExecuteSync));
    exports.Set("clearOutput", Napi::Function::New(env, ClearOutput));
    exports.Set("getOutput", Napi::Function::New(env, GetOutput));
    exports.Set("setBreak", Napi::Function::New(env, SetBreak));
    exports.Set("shutdown", Napi::Function::New(env, Shutdown));
    exports.Set("isInitialized", Napi::Function::New(env, IsInitializedJS));
    exports.Set("isDylibLoaded", Napi::Function::New(env, IsDylibLoadedJS));
    return exports;
}

NODE_API_MODULE(stata_bridge, Init)