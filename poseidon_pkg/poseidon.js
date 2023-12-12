import * as wasm from "./poseidon_bg.wasm";
import { __wbg_set_wasm } from "./poseidon_bg.js";
__wbg_set_wasm(wasm);
export * from "./poseidon_bg.js";
