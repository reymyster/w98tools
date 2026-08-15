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

/**
 * Escapes a string for use inside a C# string literal. property.jsonKey is
 * whatever the source JSON's author typed, so it can contain a quote, a
 * backslash, a raw newline, or other control characters -- each of those,
 * interpolated verbatim into `[JsonPropertyName("…")]`, produces C# that
 * fails to compile (CS1003 / CS1009 / CS1010). See emit-typescript.ts's use
 * of JSON.stringify for the same escaping problem on the other target.
 */
function csharpString(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\\") out += "\\\\";
    else if (char === '"') out += '\\"';
    else if (char === "\n") out += "\\n";
    else if (char === "\r") out += "\\r";
    else if (char === "\t") out += "\\t";
    else if (code < 0x20 || code === 0x7f)
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    else out += char;
  }
  return out;
}

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
        lines.push(
          `    [JsonPropertyName("${csharpString(property.jsonKey)}")]`,
        );
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
