import { pascalCase } from "./infer";
import {
  declarationOrder,
  type InferResult,
  type ObjectType,
  type TypeNode,
} from "./types";

export type CsharpStyle = "record" | "class";

const PRIMITIVES: Record<string, string> = {
  string: "string",
  int: "int",
  long: "long",
  double: "double",
  bool: "bool",
  unknown: "object",
};

function renderType(node: TypeNode): string {
  const suffix = node.nullable ? "?" : "";
  if (node.kind === "primitive")
    return `${PRIMITIVES[node.primitive]}${suffix}`;
  if (node.kind === "array") return `${renderType(node.element)}[]${suffix}`;
  return `${node.ref}${suffix}`;
}

/**
 * Property names for one type. Two keys can pascal-case to the same name, and
 * C# additionally rejects a member named after its own enclosing type, so both
 * are resolved here rather than at the call site.
 */
function propertyNames(object: ObjectType): string[] {
  const used = new Set<string>();

  return object.properties.map((property) => {
    let name = pascalCase(property.jsonKey);
    if (name === object.name) name = `${name}Value`;

    if (used.has(name)) {
      let suffix = 2;
      while (used.has(`${name}${suffix}`)) suffix += 1;
      name = `${name}${suffix}`;
    }

    used.add(name);
    return name;
  });
}

export function emitCsharp(result: InferResult, style: CsharpStyle): string {
  const accessor = style === "record" ? "init" : "set";
  const keyword = style === "record" ? "record" : "class";

  let needsUsing = false;
  const declarations = declarationOrder(result).map((object) => {
    const names = propertyNames(object);

    const members = object.properties.map((property, index) => {
      const name = names[index];
      const lines: string[] = [];

      if (name !== property.jsonKey) {
        needsUsing = true;
        lines.push(`    [JsonPropertyName("${property.jsonKey}")]`);
      }

      lines.push(
        `    public ${renderType(property.type)} ${name} { get; ${accessor}; }`,
      );
      return lines.join("\n");
    });

    return `public ${keyword} ${object.name}\n{\n${members.join("\n\n")}\n}`;
  });

  const body = declarations.join("\n\n");
  return needsUsing
    ? `using System.Text.Json.Serialization;\n\n${body}\n`
    : `${body}\n`;
}
