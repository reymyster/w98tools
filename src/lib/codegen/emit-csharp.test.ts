import { describe, expect, it } from "vitest";
import { emitCsharp } from "./emit-csharp";
import { inferRoot } from "./infer";
import type { InferResult } from "./types";

function ir(json: string, rootName = "Root"): InferResult {
  const outcome = inferRoot(JSON.parse(json), rootName);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.result;
}

describe("emitCsharp", () => {
  it("emits a record with init-only properties", () => {
    const code = emitCsharp(ir('{"Name":"x"}'), "record");

    expect(code).toContain("public record Root");
    expect(code).toContain("public string Name { get; init; }");
  });

  it("emits a class with settable properties", () => {
    const code = emitCsharp(ir('{"Name":"x"}'), "class");

    expect(code).toContain("public class Root");
    expect(code).toContain("public string Name { get; set; }");
  });

  it("adds JsonPropertyName only when the key differs from the property name", () => {
    const code = emitCsharp(ir('{"first_name":"x","Name":"y"}'), "record");

    expect(code).toContain('[JsonPropertyName("first_name")]');
    expect(code).not.toContain('[JsonPropertyName("Name")]');
  });

  it("includes the serialization using only when an attribute is emitted", () => {
    expect(emitCsharp(ir('{"first_name":"x"}'), "record")).toContain(
      "using System.Text.Json.Serialization;",
    );
    expect(emitCsharp(ir('{"Name":"x"}'), "record")).not.toContain("using ");
  });

  it("maps primitives to C# types", () => {
    const code = emitCsharp(
      ir('{"S":"x","I":1,"L":3000000000,"D":1.5,"B":true}'),
      "record",
    );

    expect(code).toContain("public string S");
    expect(code).toContain("public int I");
    expect(code).toContain("public long L");
    expect(code).toContain("public double D");
    expect(code).toContain("public bool B");
  });

  it("marks nullable values with a question mark", () => {
    const code = emitCsharp(ir('{"Maybe":null}'), "record");

    expect(code).toContain("public object? Maybe");
  });

  it("emits arrays with brackets", () => {
    const code = emitCsharp(ir('{"Tags":["a"]}'), "record");

    expect(code).toContain("public string[] Tags");
  });

  it("emits nested types after the root", () => {
    const code = emitCsharp(ir('{"Address":{"City":"x"}}', "Person"), "record");

    expect(code.indexOf("public record Person")).toBeLessThan(
      code.indexOf("public record Address"),
    );
    expect(code).toContain("public Address Address");
  });

  it("renames a property that would collide with its enclosing type", () => {
    // C# rejects a member with the same name as the type that contains it.
    const code = emitCsharp(ir('{"person":{"person":"x"}}', "Root"), "record");

    expect(code).toContain("public record Person");
    expect(code).toContain("public string PersonValue { get; init; }");
    expect(code).toContain('[JsonPropertyName("person")]');
  });

  it("disambiguates two keys that pascal-case to the same name", () => {
    const code = emitCsharp(ir('{"first_name":"a","firstName":"b"}'), "record");

    expect(code).toContain("public string FirstName");
    expect(code).toContain("public string FirstName2");
  });

  it("escapes a double quote in a JsonPropertyName key", () => {
    const json = JSON.stringify({ 'a"b': "x" });
    const code = emitCsharp(ir(json), "record");

    expect(code).toContain('[JsonPropertyName("a\\"b")]');
  });

  it("escapes a backslash in a JsonPropertyName key", () => {
    const json = JSON.stringify({ "C:\\Users": "x" });
    const code = emitCsharp(ir(json), "record");

    expect(code).toContain('[JsonPropertyName("C:\\\\Users")]');
  });

  it("escapes a newline in a JsonPropertyName key rather than emitting it literally", () => {
    const json = JSON.stringify({ "a\nb": "x" });
    const code = emitCsharp(ir(json), "record");

    expect(code).toContain('[JsonPropertyName("a\\nb")]');
    // A literal newline inside the attribute's string literal is CS1010.
    expect(code).not.toMatch(/JsonPropertyName\("a\nb"\)/);
  });

  it("escapes a tab and carriage return in a JsonPropertyName key", () => {
    const json = JSON.stringify({ "a\tb\rc": "x" });
    const code = emitCsharp(ir(json), "record");

    expect(code).toContain('[JsonPropertyName("a\\tb\\rc")]');
  });

  it("escapes other control characters as \\u escapes", () => {
    const json = JSON.stringify({ "a\u0001b": "x" });
    const code = emitCsharp(ir(json), "record");

    expect(code).toContain('[JsonPropertyName("a\\u0001b")]');
  });
});
