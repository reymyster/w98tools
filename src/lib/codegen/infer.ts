import type {
  InferResult,
  ObjectType,
  PrimitiveKind,
  Property,
  TypeNode,
} from "./types";

const INT_MIN = -2_147_483_648;
const INT_MAX = 2_147_483_647;

const UNKNOWN: TypeNode = {
  kind: "primitive",
  primitive: "unknown",
  nullable: false,
};

export function pascalCase(key: string): string {
  const words = key
    // Bounded quantifiers throughout: these run per key on pasted input.
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]{1,64}/)
    .filter(Boolean);

  const joined = words
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");

  if (joined === "") return "Item";
  // No identifier in C# or TypeScript may start with a digit.
  return /^[0-9]/.test(joined) ? `_${joined}` : joined;
}

/** Words spelled the same in singular and plural. */
const INVARIANT_WORDS = new Set(["series", "species"]);

/**
 * Common words whose singular already ends in "-ie" — pluralized by adding
 * just "s", not by the "consonant + y -> consonant + ies" pattern that
 * "category" -> "categories" follows. Both patterns end in "-ies", so the
 * general rule below can't tell them apart without this list.
 */
const IE_SINGULARS = new Set([
  "movie",
  "cookie",
  "calorie",
  "zombie",
  "selfie",
  "rookie",
  "genie",
  "veggie",
  "auntie",
  "birdie",
]);

/** Best-effort English singularization, used only to name array element types. */
export function singularize(word: string): string {
  if (INVARIANT_WORDS.has(word.toLowerCase())) return word;
  if (/ss$/i.test(word)) return word;
  if (/ies$/i.test(word) && word.length > 3) {
    const dropS = word.slice(0, -1);
    if (IE_SINGULARS.has(dropS.toLowerCase())) return dropS;
    return `${word.slice(0, -3)}y`;
  }
  if (/(s|x|z|ch|sh)es$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word) && word.length > 1) return word.slice(0, -1);
  return word;
}

type Context = {
  objects: ObjectType[];
  /** Shape signature to the name already minted for it. */
  bySignature: Map<string, string>;
  usedNames: Set<string>;
};

function signatureOf(node: TypeNode): string {
  const nullable = node.nullable ? "?" : "";
  if (node.kind === "primitive") return `${node.primitive}${nullable}`;
  if (node.kind === "array") return `[${signatureOf(node.element)}]${nullable}`;
  // Children are deduplicated before their parents, so identical child shapes
  // already share a name and the parent signatures compare equal.
  return `{${node.ref}}${nullable}`;
}

function propertiesSignature(properties: Property[]): string {
  // Sorted so two objects with the same keys/types compare equal regardless
  // of the order those keys appeared in the source JSON. The *declaration*
  // (the `properties` array itself) keeps its original order — only this
  // dedup key is order-independent.
  return properties
    .map((property) => `${property.jsonKey}:${signatureOf(property.type)}`)
    .sort()
    .join(",");
}

function allocateName(hint: string, ctx: Context): string {
  const base = pascalCase(hint);
  if (!ctx.usedNames.has(base)) {
    ctx.usedNames.add(base);
    return base;
  }

  let suffix = 2;
  while (ctx.usedNames.has(`${base}${suffix}`)) suffix += 1;
  const name = `${base}${suffix}`;
  ctx.usedNames.add(name);
  return name;
}

function widenNumeric(a: PrimitiveKind, b: PrimitiveKind): PrimitiveKind {
  if (a === "double" || b === "double") return "double";
  if (a === "long" || b === "long") return "long";
  return "int";
}

const NUMERIC = new Set<PrimitiveKind>(["int", "long", "double"]);

/** The type that describes both inputs, or unknown when they disagree. */
function unify(a: TypeNode, b: TypeNode): TypeNode {
  const nullable = a.nullable || b.nullable;

  // A null-only value carries no shape, so the other side wins outright.
  if (a.kind === "primitive" && a.primitive === "unknown") {
    return { ...b, nullable };
  }
  if (b.kind === "primitive" && b.primitive === "unknown") {
    return { ...a, nullable };
  }

  if (a.kind === "primitive" && b.kind === "primitive") {
    if (a.primitive === b.primitive) return { ...a, nullable };
    if (NUMERIC.has(a.primitive) && NUMERIC.has(b.primitive)) {
      return {
        kind: "primitive",
        primitive: widenNumeric(a.primitive, b.primitive),
        nullable,
      };
    }
    return { ...UNKNOWN, nullable };
  }

  if (a.kind === "array" && b.kind === "array") {
    return { kind: "array", element: unify(a.element, b.element), nullable };
  }

  if (a.kind === "object" && b.kind === "object" && a.ref === b.ref) {
    return { ...a, nullable };
  }

  return { ...UNKNOWN, nullable };
}

function inferValue(value: unknown, hint: string, ctx: Context): TypeNode {
  if (value === null) return { ...UNKNOWN, nullable: true };

  if (typeof value === "string") {
    return { kind: "primitive", primitive: "string", nullable: false };
  }

  if (typeof value === "boolean") {
    return { kind: "primitive", primitive: "bool", nullable: false };
  }

  if (typeof value === "number") {
    const primitive: PrimitiveKind = !Number.isInteger(value)
      ? "double"
      : value < INT_MIN || value > INT_MAX
        ? "long"
        : "int";
    return { kind: "primitive", primitive, nullable: false };
  }

  if (Array.isArray(value)) {
    const elementHint = singularize(hint);
    const element = value
      .map((item) => inferValue(item, elementHint, ctx))
      .reduce<TypeNode | null>(
        (acc, item) => (acc === null ? item : unify(acc, item)),
        null,
      );
    return { kind: "array", element: element ?? UNKNOWN, nullable: false };
  }

  if (typeof value === "object") {
    const properties: Property[] = Object.entries(
      value as Record<string, unknown>,
    ).map(([jsonKey, child]) => ({
      jsonKey,
      type: inferValue(child, jsonKey, ctx),
    }));

    const signature = propertiesSignature(properties);
    const existing = ctx.bySignature.get(signature);
    if (existing !== undefined) {
      return { kind: "object", ref: existing, nullable: false };
    }

    const name = allocateName(hint, ctx);
    ctx.bySignature.set(signature, name);
    ctx.objects.push({ name, properties });
    return { kind: "object", ref: name, nullable: false };
  }

  return UNKNOWN;
}

function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Marks every object type reachable from `node`, directly or through the
 * properties of reachable objects. Conflicting array-element shapes fall
 * back to unknown in `unify`, but both candidate object types were already
 * registered before unification ran — this is how they get pruned back out.
 */
function markReachable(
  node: TypeNode,
  byName: Map<string, ObjectType>,
  reachable: Set<string>,
): void {
  if (node.kind === "array") {
    markReachable(node.element, byName, reachable);
    return;
  }
  if (node.kind !== "object" || reachable.has(node.ref)) return;

  reachable.add(node.ref);
  const object = byName.get(node.ref);
  if (!object) return;
  for (const property of object.properties) {
    markReachable(property.type, byName, reachable);
  }
}

/** Every object type reachable from `root`, in the order given. */
function reachableObjects(root: TypeNode, objects: ObjectType[]): ObjectType[] {
  const byName = new Map(objects.map((object) => [object.name, object]));
  const reachable = new Set<string>();
  markReachable(root, byName, reachable);
  return objects.filter((object) => reachable.has(object.name));
}

export type InferOutcome =
  | { ok: true; result: InferResult }
  | { ok: false; error: string };

const ROOT_ERROR = "Root must be an object or array of objects.";

export function inferRoot(value: unknown, rootName: string): InferOutcome {
  const rootIsObject = isPlainObject(value);
  const rootIsObjectArray =
    Array.isArray(value) && value.length > 0 && value.every(isPlainObject);

  if (!rootIsObject && !rootIsObjectArray) {
    return { ok: false, error: ROOT_ERROR };
  }

  const ctx: Context = {
    objects: [],
    bySignature: new Map(),
    usedNames: new Set(),
  };

  const root = inferValue(value, rootName, ctx);
  return {
    ok: true,
    result: { root, objects: reachableObjects(root, ctx.objects) },
  };
}
