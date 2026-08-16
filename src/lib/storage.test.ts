import { beforeEach, describe, expect, it } from "vitest";
import {
  CONTENT_TTL_MS,
  KEY_PREFIX,
  listKeys,
  loadValue,
  purgeExpired,
  removeValue,
  SCHEMA_VERSION,
  saveValue,
} from "./storage";

const NOW = 1_700_000_000_000;

// KEY_PREFIX is part of the exported contract Tasks 2-4 build on (the store
// and widgets namespace their keys under it), so it's pinned here even
// though nothing in this file needs it to pass.
describe("KEY_PREFIX", () => {
  it("is the w98: namespace every persisted key lives under", () => {
    expect(KEY_PREFIX).toBe("w98:");
  });
});

/** A real Storage implementation, so tests exercise the actual API surface. */
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  } as Storage;
}

describe("saveValue / loadValue", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeStorage();
  });

  it("round-trips a value", () => {
    saveValue(storage, "w98:a", { hello: "world" }, NOW);

    expect(loadValue(storage, "w98:a", null, NOW)).toEqual({ hello: "world" });
  });

  it("round-trips values that JSON preserves exactly", () => {
    saveValue(storage, "w98:a", [1, "two", true, null], NOW);

    expect(loadValue(storage, "w98:a", null, NOW)).toEqual([
      1,
      "two",
      true,
      null,
    ]);
  });

  it("returns undefined for a key that was never written", () => {
    expect(loadValue(storage, "w98:missing", null, NOW)).toBeUndefined();
  });

  it("returns the value while it is within its TTL", () => {
    saveValue(storage, "w98:a", "fresh", NOW);

    expect(loadValue(storage, "w98:a", CONTENT_TTL_MS, NOW + 1000)).toBe(
      "fresh",
    );
  });

  it("returns undefined once the TTL has passed", () => {
    saveValue(storage, "w98:a", "stale", NOW);

    expect(
      loadValue(storage, "w98:a", CONTENT_TTL_MS, NOW + CONTENT_TTL_MS + 1),
    ).toBeUndefined();
  });

  it("ignores the TTL entirely when it is null", () => {
    saveValue(storage, "w98:a", "kept", NOW);

    expect(loadValue(storage, "w98:a", null, NOW + CONTENT_TTL_MS * 100)).toBe(
      "kept",
    );
  });

  it("discards a value written by a different schema version", () => {
    storage.setItem(
      "w98:a",
      JSON.stringify({ version: SCHEMA_VERSION + 1, savedAt: NOW, value: "x" }),
    );

    expect(loadValue(storage, "w98:a", null, NOW)).toBeUndefined();
  });

  it("discards malformed JSON rather than throwing", () => {
    storage.setItem("w98:a", "{not json");

    expect(() => loadValue(storage, "w98:a", null, NOW)).not.toThrow();
    expect(loadValue(storage, "w98:a", null, NOW)).toBeUndefined();
  });

  it("discards JSON that is not an envelope", () => {
    storage.setItem("w98:a", JSON.stringify({ nope: true }));

    expect(loadValue(storage, "w98:a", null, NOW)).toBeUndefined();
  });

  it("discards an envelope whose savedAt is not a finite number", () => {
    storage.setItem(
      "w98:a",
      JSON.stringify({ version: SCHEMA_VERSION, savedAt: "soon", value: "x" }),
    );

    expect(loadValue(storage, "w98:a", CONTENT_TTL_MS, NOW)).toBeUndefined();
  });

  it("swallows a storage that throws on write", () => {
    const hostile = {
      ...makeStorage(),
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
    } as Storage;

    expect(() => saveValue(hostile, "w98:a", "x", NOW)).not.toThrow();
  });

  it("swallows a storage that throws on read", () => {
    const hostile = {
      ...makeStorage(),
      getItem: () => {
        throw new DOMException("SecurityError");
      },
    } as Storage;

    expect(() => loadValue(hostile, "w98:a", null, NOW)).not.toThrow();
    expect(loadValue(hostile, "w98:a", null, NOW)).toBeUndefined();
  });
});

describe("listKeys / removeValue", () => {
  it("lists only keys carrying the prefix", () => {
    const storage = makeStorage();
    saveValue(storage, "w98:one", 1, NOW);
    saveValue(storage, "w98:two", 2, NOW);
    storage.setItem("other", "x");

    expect(listKeys(storage, "w98:").sort()).toEqual(["w98:one", "w98:two"]);
  });

  it("removes a value", () => {
    const storage = makeStorage();
    saveValue(storage, "w98:a", 1, NOW);

    removeValue(storage, "w98:a");

    expect(loadValue(storage, "w98:a", null, NOW)).toBeUndefined();
  });
});

describe("purgeExpired", () => {
  it("removes expired entries and keeps fresh ones", () => {
    const storage = makeStorage();
    saveValue(storage, "w98:old", "gone", NOW);
    saveValue(storage, "w98:new", "kept", NOW + CONTENT_TTL_MS);

    const removed = purgeExpired(
      storage,
      "w98:",
      CONTENT_TTL_MS,
      NOW + CONTENT_TTL_MS + 1,
    );

    expect(removed).toBe(1);
    expect(loadValue(storage, "w98:new", null, NOW)).toBe("kept");
    expect(storage.getItem("w98:old")).toBeNull();
  });

  it("removes entries it cannot parse, since they can never be read anyway", () => {
    const storage = makeStorage();
    storage.setItem("w98:junk", "{not json");

    expect(purgeExpired(storage, "w98:", CONTENT_TTL_MS, NOW)).toBe(1);
    expect(storage.getItem("w98:junk")).toBeNull();
  });

  it("leaves keys outside the prefix alone", () => {
    const storage = makeStorage();
    storage.setItem("other", "{not json");

    purgeExpired(storage, "w98:", CONTENT_TTL_MS, NOW);

    expect(storage.getItem("other")).toBe("{not json");
  });
});
