/**
 * The intermediate representation between JSON inference and code emission.
 * Both emitters read this and neither knows about JSON, which is what keeps
 * "what shape is this data" separate from "how does C# spell it".
 */

export type PrimitiveKind =
  | "string"
  | "int"
  | "long"
  | "double"
  | "bool"
  /** A null-only value, an empty array, or elements that couldn't unify. */
  | "unknown";

export type TypeNode = { nullable: boolean } & (
  | { kind: "primitive"; primitive: PrimitiveKind }
  | { kind: "array"; element: TypeNode }
  | { kind: "object"; ref: string }
);

export type Property = { jsonKey: string; type: TypeNode };

export type ObjectType = { name: string; properties: Property[] };

export type InferResult = {
  root: TypeNode;
  /** Every named object type, deduplicated by shape, in inference order. */
  objects: ObjectType[];
};

function rootObjectRef(node: TypeNode): string | null {
  if (node.kind === "object") return node.ref;
  if (node.kind === "array") return rootObjectRef(node.element);
  return null;
}

/**
 * Objects in the order they should be declared. Inference registers children
 * before parents, so the root would otherwise be emitted last — readable code
 * leads with the type the caller actually named.
 */
export function declarationOrder(result: InferResult): ObjectType[] {
  const ref = rootObjectRef(result.root);
  const root = result.objects.find((object) => object.name === ref);
  if (!root) return result.objects;
  return [root, ...result.objects.filter((object) => object !== root)];
}
