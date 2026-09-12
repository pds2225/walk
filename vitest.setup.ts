/**
 * Node 25+ exposes a disabled global localStorage unless --localstorage-file is
 * supplied. jsdom normally supplies its own origin-scoped storage, but Vitest's
 * environment bridge can leave window.localStorage undefined on those Node
 * versions. Keep browser tests deterministic without enabling a Node global.
 */
if (typeof window !== "undefined" && typeof window.localStorage === "undefined") {
  let values = new Map<string, string>();

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return values.size;
      },
      clear() {
        values = new Map();
      },
      getItem(key: string) {
        return values.get(String(key)) ?? null;
      },
      key(index: number) {
        return [...values.keys()][index] ?? null;
      },
      removeItem(key: string) {
        values.delete(String(key));
      },
      setItem(key: string, value: string) {
        values.set(String(key), String(value));
      },
    } satisfies Storage,
  });
}
