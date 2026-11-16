#include <node_api.h>
#include <stdlib.h>

extern char *yogurt_call_snapshot(const char *ids);

static napi_value snapshot(napi_env env, napi_callback_info info) {
  napi_value arg, result;
  size_t argc = 1, length;
  char ids[4096];
  if (napi_get_cb_info(env, info, &argc, &arg, NULL, NULL) != napi_ok || argc != 1 ||
      napi_get_value_string_utf8(env, arg, ids, sizeof(ids), &length) != napi_ok || length >= sizeof(ids) - 1) {
    napi_throw_type_error(env, NULL, "Expected call app identifiers");
    return NULL;
  }
  char *json = yogurt_call_snapshot(ids);
  if (!json) {
    napi_throw_error(env, NULL, "Could not read call windows");
    return NULL;
  }
  napi_status status = napi_create_string_utf8(env, json, NAPI_AUTO_LENGTH, &result);
  free(json);
  return status == napi_ok ? result : NULL;
}

NAPI_MODULE_INIT() {
  napi_value fn;
  napi_create_function(env, "snapshot", NAPI_AUTO_LENGTH, snapshot, NULL, &fn);
  return fn;
}
