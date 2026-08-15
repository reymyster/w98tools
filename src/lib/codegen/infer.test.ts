import { describe, expect, it } from "vitest";
import { inferRoot, pascalCase, singularize } from "./infer";
import { declarationOrder } from "./types";

/** Unwraps a successful inference, failing loudly if it wasn't one. */
function infer(json: string, rootName = "Root") {
  const outcome = inferRoot(JSON.parse(json), rootName);
  if (!outcome.ok) throw new Error(`expected success, got: ${outcome.error}`);
  return outcome.result;
}

describe("pascalCase", () => {
  it("converts snake_case", () => {
    expect(pascalCase("first_name")).toBe("FirstName");
  });

  it("converts kebab-case", () => {
    expect(pascalCase("first-name")).toBe("FirstName");
  });

  it("converts camelCase", () => {
    expect(pascalCase("firstName")).toBe("FirstName");
  });

  it("leaves PascalCase alone", () => {
    expect(pascalCase("FirstName")).toBe("FirstName");
  });

  it("prefixes a leading digit, which no identifier may start with", () => {
    expect(pascalCase("2fa_enabled")).toBe("_2faEnabled");
  });

  it("falls back to Item for a key with no usable characters", () => {
    expect(pascalCase("---")).toBe("Item");
  });
});

describe("singularize", () => {
  it("turns ies into y", () => {
    expect(singularize("Categories")).toBe("Category");
  });

  it("strips es after a sibilant", () => {
    expect(singularize("Boxes")).toBe("Box");
  });

  it("strips a trailing s", () => {
    expect(singularize("Items")).toBe("Item");
  });

  it("leaves a double s alone", () => {
    expect(singularize("Address")).toBe("Address");
  });

  it("leaves an already-singular word alone", () => {
    expect(singularize("Person")).toBe("Person");
  });

  it("keeps a plural whose singular already ends in -ie", () => {
    expect(singularize("Movies")).toBe("Movie");
    expect(singularize("Cookies")).toBe("Cookie");
  });

  it("leaves an invariant word unchanged", () => {
    expect(singularize("Series")).toBe("Series");
  });

  it("still turns the common -ies words into y", () => {
    expect(singularize("Categories")).toBe("Category");
    expect(singularize("Entries")).toBe("Entry");
    expect(singularize("Properties")).toBe("Property");
    expect(singularize("Companies")).toBe("Company");
    expect(singularize("Countries")).toBe("Country");
    expect(singularize("Queries")).toBe("Query");
    expect(singularize("Dependencies")).toBe("Dependency");
    expect(singularize("Activities")).toBe("Activity");
  });
});

describe("inferRoot", () => {
  it("infers primitives", () => {
    const result = infer('{"a":"x","b":true}');
    const root = result.objects[0];

    expect(root.properties).toEqual([
      {
        jsonKey: "a",
        type: { kind: "primitive", primitive: "string", nullable: false },
      },
      {
        jsonKey: "b",
        type: { kind: "primitive", primitive: "bool", nullable: false },
      },
    ]);
  });

  it("infers int for whole numbers and double for fractional ones", () => {
    const result = infer('{"a":1,"b":1.5}');

    expect(result.objects[0].properties[0].type).toMatchObject({
      primitive: "int",
    });
    expect(result.objects[0].properties[1].type).toMatchObject({
      primitive: "double",
    });
  });

  it("infers long for whole numbers outside signed 32-bit range", () => {
    const result = infer('{"a":3000000000}');

    expect(result.objects[0].properties[0].type).toMatchObject({
      primitive: "long",
    });
  });

  it("marks a null value nullable and unknown", () => {
    const result = infer('{"a":null}');

    expect(result.objects[0].properties[0].type).toEqual({
      kind: "primitive",
      primitive: "unknown",
      nullable: true,
    });
  });

  it("names the root type from the supplied name", () => {
    const result = infer('{"a":1}', "Person");

    expect(result.objects[0].name).toBe("Person");
  });

  it("names a nested object from its key", () => {
    const result = infer('{"home_address":{"city":"x"}}');

    expect(result.objects.map((o) => o.name)).toContain("HomeAddress");
  });

  it("names an array element type from the singularized key", () => {
    const result = infer('{"categories":[{"id":1}]}');

    expect(result.objects.map((o) => o.name)).toContain("Category");
  });

  it("declares the root type first even though children infer first", () => {
    const result = infer('{"address":{"city":"x"}}', "Person");

    expect(declarationOrder(result).map((o) => o.name)).toEqual([
      "Person",
      "Address",
    ]);
  });

  it("deduplicates structurally identical nested types", () => {
    const result = infer(
      '{"shipping":{"city":"x","zip":"y"},"billing":{"city":"a","zip":"b"}}',
    );

    // Two properties, one shared shape: Shipping is reused rather than a
    // near-identical Billing being minted alongside it.
    expect(result.objects).toHaveLength(2);
    const root = declarationOrder(result)[0];
    expect(root.properties[0].type).toEqual(root.properties[1].type);
  });

  it("deduplicates identically shaped objects regardless of key order", () => {
    const result = infer(
      '{"shipping":{"city":"x","zip":"y"},"billing":{"zip":"a","city":"b"}}',
    );

    // Same two keys mapped to the same types, just listed in a different
    // order — this must still dedupe to one shared shape plus Root.
    expect(result.objects).toHaveLength(2);
    const root = declarationOrder(result)[0];
    expect(root.properties[0].type).toEqual(root.properties[1].type);
  });

  it("resolves a name collision between different shapes", () => {
    const result = infer('{"a":{"item":{"x":1}},"b":{"item":{"y":1}}}');
    const names = result.objects.map((o) => o.name);

    expect(names).toContain("Item");
    expect(names).toContain("Item2");
  });

  it("unifies array elements, widening int to double", () => {
    const result = infer('{"nums":[1,2.5]}');

    expect(result.objects[0].properties[0].type).toEqual({
      kind: "array",
      nullable: false,
      element: { kind: "primitive", primitive: "double", nullable: false },
    });
  });

  it("unifies a null element into a nullable element type", () => {
    const result = infer('{"names":["a",null]}');

    expect(result.objects[0].properties[0].type).toMatchObject({
      element: { kind: "primitive", primitive: "string", nullable: true },
    });
  });

  it("falls back to unknown for conflicting array elements", () => {
    const result = infer('{"mixed":[1,"a"]}');

    expect(result.objects[0].properties[0].type).toMatchObject({
      element: { kind: "primitive", primitive: "unknown" },
    });
  });

  it("falls back to unknown for an empty array", () => {
    const result = infer('{"empty":[]}');

    expect(result.objects[0].properties[0].type).toMatchObject({
      element: { kind: "primitive", primitive: "unknown" },
    });
  });

  it("handles nested arrays", () => {
    const result = infer('{"grid":[[1,2],[3]]}');

    expect(result.objects[0].properties[0].type).toMatchObject({
      kind: "array",
      element: { kind: "array", element: { primitive: "int" } },
    });
  });

  it("generates the element type for an array-of-objects root", () => {
    const result = infer('[{"id":1}]', "Person");

    expect(result.root).toMatchObject({ kind: "array" });
    expect(result.objects[0].name).toBe("Person");
  });

  it("drops object types orphaned by a conflicting array-element unify", () => {
    const result = infer('{"items":[{"a":1},{"a":"x"}]}');

    // The two element shapes disagree, so the array element falls back to
    // unknown — neither per-element object type is reachable from Root and
    // both must be pruned from the result.
    expect(result.root).toMatchObject({ kind: "object", ref: "Root" });
    expect(result.objects.map((o) => o.name)).toEqual(["Root"]);
  });

  it("rejects a scalar root", () => {
    expect(inferRoot(42, "Root")).toEqual({
      ok: false,
      error: "Root must be an object or array of objects.",
    });
  });

  it("rejects an array of scalars at the root", () => {
    expect(inferRoot([1, 2], "Root")).toEqual({
      ok: false,
      error: "Root must be an object or array of objects.",
    });
  });

  it("does not merge distinct shapes with delimiters in property names", () => {
    // Object X has two properties: "a" (int) and "b" (string)
    // Object Y has one property whose key is literally "a:int,b" (string)
    // Both would produce identical signatures under the naive join-with-comma approach.
    const result = infer('{"p":{"a":1,"b":"hello"},"q":{"a:int,b":"world"}}');

    // Should have 3 objects: Root, and two distinct nested types for p and q
    expect(result.objects).toHaveLength(3);

    const root = declarationOrder(result)[0];
    // p and q should have different types
    expect(root.properties[0].type).not.toEqual(root.properties[1].type);

    // Verify p's type has two properties: a and b
    const pType = root.properties[0].type;
    expect(pType).toMatchObject({ kind: "object" });
    if (pType.kind === "object") {
      const pObject = result.objects.find((o) => o.name === pType.ref);
      expect(pObject?.properties).toHaveLength(2);
      expect(pObject?.properties.map((p) => p.jsonKey)).toEqual(
        expect.arrayContaining(["a", "b"]),
      );
    }

    // Verify q's type has one property: the literal key "a:int,b"
    const qType = root.properties[1].type;
    expect(qType).toMatchObject({ kind: "object" });
    if (qType.kind === "object") {
      const qObject = result.objects.find((o) => o.name === qType.ref);
      expect(qObject?.properties).toHaveLength(1);
      expect(qObject?.properties[0].jsonKey).toBe("a:int,b");
    }
  });

  it("names many colliding-but-differently-shaped nested objects without quadratic blowup", () => {
    // Each "groupI" property wraps a distinct-shaped object under the same
    // "item" key, so every one of them pascal-cases to the same "Item" hint
    // but forces a fresh suffix search on allocation (unlike an array, whose
    // conflicting element shapes would just collapse to unknown and prune
    // away instead of staying reachable -- see the "drops object types
    // orphaned by a conflicting array-element unify" test above). Scanning
    // candidate suffixes from 2 upward on every collision costs O(n^2):
    // measured 34.7ms/1000, 106.7ms/2000, 398.9ms/4000, 1575.8ms/8000
    // objects before this was fixed to track the next free suffix per base
    // name in a Map. 8000 finishing well under that pre-fix time, but
    // comfortably above a normal single-digit-ms run, catches a quadratic
    // regression without being flaky.
    const n = 8000;
    const root: Record<string, unknown> = {};
    for (let i = 0; i < n; i++) {
      root[`group${i}`] = { item: { [`k${i}`]: i } };
    }
    const json = JSON.stringify(root);

    const start = performance.now();
    const outcome = inferRoot(JSON.parse(json), "Root");
    const elapsed = performance.now() - start;

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // Root, plus one wrapper and one distinct "Item*" type per group.
      expect(outcome.result.objects).toHaveLength(2 * n + 1);
      const names = outcome.result.objects.map((o) => o.name);
      expect(names).toContain("Item");
      expect(names).toContain(`Item${n}`);
    }
    expect(elapsed).toBeLessThan(500);
  });
});
