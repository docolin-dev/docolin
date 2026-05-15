import { customType } from "drizzle-orm/pg-core";

// Postgres ltree. Hierarchical labels separated by dots; labels match [A-Za-z0-9_].
// Doco kinds are stored using underscores and dots; helpers translate to and from the
// human-readable form (`hardware/gpu/nvidia/driver-install`) at the application boundary.
export const ltree = customType<{ data: string; driverData: string }>({
  dataType() {
    return "ltree";
  },
});

// Translate a human-readable kind path to the ltree representation.
// `hardware/gpu/nvidia/driver-install` -> `hardware.gpu.nvidia.driver_install`
export function toLtree(path: string): string {
  return path.replaceAll("-", "_").replaceAll("/", ".");
}

// Translate an ltree value back to the human-readable form.
// `hardware.gpu.nvidia.driver_install` -> `hardware/gpu/nvidia/driver-install`
export function fromLtree(path: string): string {
  return path.replaceAll(".", "/").replaceAll("_", "-");
}
