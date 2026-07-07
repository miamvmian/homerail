import {
  getPort,
  getHomerailHome,
  getDataRoot,
  getDbPath,
  getLegacyManagerTsDataRoot,
  getPythonManagerDataRoot,
  getSessionStoreRoot,
  isIsolatedFromPythonManager,
} from "./env.js";

export function getDiagnostics(port: number) {
  return {
    port,
    homerail_home: getHomerailHome(),
    data_root: getDataRoot(),
    db_path: getDbPath(),
    session_store_root: getSessionStoreRoot(),
    legacy_manager_ts_data_root: getLegacyManagerTsDataRoot(),
    python_manager_data_root: getPythonManagerDataRoot(),
    isolated_from_python_manager: isIsolatedFromPythonManager(),
  };
}
