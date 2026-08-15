import { declarationOrder, type InferResult, type TypeNode } from "./types";

const PRIMITIVES: Record<string, string> = {
  string: "string",
  int: "number",
  long: "number",
  double: "number",
  bool: "boolean",
  unknown: "unknown",
};

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]{0,255}$/;

function renderType(node: TypeNode): string {
  let base: string;

  if (node.kind === "primitive") {
    base = PRIMITIVES[node.primitive];
  } else if (node.kind === "array") {
    const element = renderType(node.element);
    // A union inside an array needs parentheses or the [] binds to null alone.
    base = node.element.nullable ? `(${element})[]` : `${element}[]`;
  } else {
    base = node.ref;
  }

  return node.nullable ? `${base} | null` : base;
}

export function emitTypeScript(result: InferResult): string {
  const declarations = declarationOrder(result).map((object) => {
    const members = object.properties.map((property) => {
      const key = IDENTIFIER.test(property.jsonKey)
        ? property.jsonKey
        : JSON.stringify(property.jsonKey);
      return `  ${key}: ${renderType(property.type)};`;
    });

    return `export interface ${object.name} {\n${members.join("\n")}\n}`;
  });

  return `${declarations.join("\n\n")}\n`;
}
