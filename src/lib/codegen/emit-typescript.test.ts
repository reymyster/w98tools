import { describe, expect, it } from "vitest";
import { emitTypeScript } from "./emit-typescript";
import { inferRoot } from "./infer";
import type { InferResult } from "./types";

function ir(json: string, rootName = "Root"): InferResult {
  const outcome = inferRoot(JSON.parse(json), rootName);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.result;
}

describe("emitTypeScript", () => {
  it("emits an exported interface", () => {
    const code = emitTypeScript(ir('{"name":"x"}'));

    expect(code).toContain("export interface Root {");
    expect(code).toContain("  name: string;");
  });

  it("keeps the original JSON keys rather than renaming them", () => {
    const code = emitTypeScript(ir('{"first_name":"x"}'));

    expect(code).toContain("  first_name: string;");
  });

  it("quotes keys that are not valid identifiers", () => {
    const code = emitTypeScript(ir('{"content-type":"x"}'));

    expect(code).toContain('  "content-type": string;');
  });

  it("maps every numeric primitive to number", () => {
    const code = emitTypeScript(ir('{"i":1,"l":3000000000,"d":1.5}'));

    expect(code).toContain("  i: number;");
    expect(code).toContain("  l: number;");
    expect(code).toContain("  d: number;");
  });

  it("maps bool to boolean and an unresolved value to unknown", () => {
    const code = emitTypeScript(ir('{"b":true,"mixed":[1,"a"]}'));

    expect(code).toContain("  b: boolean;");
    expect(code).toContain("  mixed: unknown[];");
  });

  it("unions null onto a nullable property", () => {
    const code = emitTypeScript(ir('{"maybe":null}'));

    expect(code).toContain("  maybe: unknown | null;");
  });

  it("parenthesizes a nullable array element", () => {
    const code = emitTypeScript(ir('{"names":["a",null]}'));

    expect(code).toContain("  names: (string | null)[];");
  });

  it("emits nested interfaces after the root", () => {
    const code = emitTypeScript(ir('{"address":{"city":"x"}}', "Person"));

    expect(code.indexOf("interface Person")).toBeLessThan(
      code.indexOf("interface Address"),
    );
    expect(code).toContain("  address: Address;");
  });
});
