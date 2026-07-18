export const AHK_VERSION_V1 = "v1";
export const AHK_VERSION_V2 = "v2";
export const DEFAULT_AHK_VERSION = AHK_VERSION_V2;

export function normalizeAhkVersion(value) {
  return value === AHK_VERSION_V1 ? AHK_VERSION_V1 : AHK_VERSION_V2;
}
