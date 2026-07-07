import { z } from "zod";

type JsonSchema = Record<string, unknown>;
type ZodSchema = { optional: () => ZodSchema; describe: (description: string) => ZodSchema };
type ZodShape = Record<string, ZodSchema>;

function asRecord(value: unknown): JsonSchema {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonSchema
    : {};
}

function withDescription(schema: ZodSchema, json: JsonSchema): ZodSchema {
  return typeof json.description === "string" && json.description
    ? schema.describe(json.description)
    : schema;
}

function literalUnion(values: unknown[]): ZodSchema {
  if (values.length === 0) return z.never();
  const literals = values.map((value) => z.literal(value as never));
  if (literals.length === 1) return literals[0];
  return z.union(literals as unknown as [never, never, ...never[]]);
}

function schemaType(json: JsonSchema): string {
  const type = json.type;
  return Array.isArray(type) ? String(type.find((item) => item !== "null") ?? "") : String(type ?? "");
}

function convertSchema(json: JsonSchema): ZodSchema {
  if (Array.isArray(json.enum)) {
    return withDescription(literalUnion(json.enum), json);
  }

  const variants = Array.isArray(json.anyOf) ? json.anyOf : Array.isArray(json.oneOf) ? json.oneOf : undefined;
  if (variants && variants.length > 0) {
    const converted = variants.map((item) => convertSchema(asRecord(item)));
    const union = converted.length === 1
      ? converted[0]
      : z.union(converted as unknown as [never, never, ...never[]]);
    return withDescription(union, json);
  }

  let out: ZodSchema;
  switch (schemaType(json)) {
    case "string":
      out = z.string();
      break;
    case "integer":
      out = z.number().int();
      break;
    case "number":
      out = z.number();
      break;
    case "boolean":
      out = z.boolean();
      break;
    case "array":
      out = z.array(convertSchema(asRecord(json.items)) as never);
      break;
    case "object": {
      const properties = asRecord(json.properties);
      const required = Array.isArray(json.required) ? json.required.map(String) : [];
      const shape: ZodShape = {};
      for (const [name, propSchema] of Object.entries(properties)) {
        const prop = convertSchema(asRecord(propSchema));
        shape[name] = required.includes(name) ? prop : prop.optional();
      }
      out = Object.keys(shape).length > 0 ? z.object(shape).passthrough() : z.record(z.string(), z.unknown());
      break;
    }
    default:
      out = z.unknown();
      break;
  }

  return withDescription(out, json);
}

export function jsonSchemaObjectToZodRawShape(schema: Record<string, unknown>): Record<string, unknown> {
  const root = asRecord(schema);
  const properties = asRecord(root.properties);
  const required = Array.isArray(root.required) ? root.required.map(String) : [];
  const shape: ZodShape = {};
  for (const [name, propSchema] of Object.entries(properties)) {
    const prop = convertSchema(asRecord(propSchema));
    shape[name] = required.includes(name) ? prop : prop.optional();
  }
  return shape as Record<string, unknown>;
}
