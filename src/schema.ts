/**
 * Schema normalization layer.
 *
 * ws-asyncapi accepts **any** validator that implements the
 * [Standard Schema](https://standardschema.dev) spec (Zod, Valibot, ArkType, …)
 * as well as raw [TypeBox](https://github.com/sinclairzx81/typebox) schemas. This
 * module is the single seam every other part of the framework goes through, so
 * nothing else has to know which validator produced a schema.
 *
 * Three operations are normalized:
 *  - **type inference** — {@link InferIn} / {@link InferOut}
 *  - **validation** — {@link validate} (sync or async, normalized issues)
 *  - **JSON Schema** for the AsyncAPI contract — {@link toJsonSchema}
 *    (via the companion StandardJSONSchemaV1 spec; TypeBox is already JSON Schema)
 */
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { StandardSchemaV1 } from "@standard-schema/spec";

/** A schema accepted by the builder: any Standard Schema, or a TypeBox schema. */
export type AnySchema = StandardSchemaV1 | TSchema;

/** The JSON Schema draft a converter should target. AsyncAPI 3.0's Schema Object
 *  is a superset of draft-07, so that is the default and the recommended target. */
export type JsonSchemaTarget = "draft-07" | "draft-2020-12" | "openapi-3.0";

/** Whether a schema describes the value going *into* validation (the wire shape a
 *  client sends) or *out of* it (the parsed value a handler receives / a server
 *  sends). They differ for validators with transforms/coercion/defaults. */
export type SchemaIO = "input" | "output";

/** Static type a handler receives after a schema validates (post-parse). */
export type InferOut<S> = S extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<S>
    : S extends TSchema
      ? Static<S>
      : unknown;

/** Static type that goes onto the wire / into validation (pre-parse). */
export type InferIn<S> = S extends StandardSchemaV1
    ? StandardSchemaV1.InferInput<S>
    : S extends TSchema
      ? Static<S>
      : unknown;

/** True if `s` implements Standard Schema (has a `~standard` prop). */
export function isStandardSchema(s: unknown): s is StandardSchemaV1 {
    return (
        !!s &&
        (typeof s === "object" || typeof s === "function") &&
        "~standard" in (s as object)
    );
}

export interface ValidationIssue {
    /** JSON-pointer-ish path to the offending value, e.g. "/beneficiary/id" */
    path?: string;
    message: string;
}

export type ValidationResult =
    | { ok: true; value: unknown }
    | { ok: false; issues: ValidationIssue[] };

function normalizeIssue(issue: StandardSchemaV1.Issue): ValidationIssue {
    const segments = issue.path?.map((seg) =>
        typeof seg === "object" && seg !== null
            ? String((seg as { key: PropertyKey }).key)
            : String(seg),
    );
    return {
        path: segments && segments.length ? `/${segments.join("/")}` : undefined,
        message: issue.message,
    };
}

/**
 * Validate `value` against `schema`. Standard Schema validators may run async;
 * TypeBox runs sync. Returns the **parsed** value on success (so transforms /
 * coercion / defaults are applied), or normalized issues on failure.
 */
export async function validate(
    schema: AnySchema,
    value: unknown,
): Promise<ValidationResult> {
    if (isStandardSchema(schema)) {
        let result = schema["~standard"].validate(value);
        if (result instanceof Promise) result = await result;
        if (result.issues)
            return { ok: false, issues: result.issues.map(normalizeIssue) };
        return { ok: true, value: result.value };
    }
    // TypeBox fallback (no input/output distinction; value is unchanged)
    if (Value.Check(schema, value)) return { ok: true, value };
    return {
        ok: false,
        issues: [...Value.Errors(schema, value)].map((e) => ({
            path: e.path,
            message: e.message,
        })),
    };
}

/**
 * Produce a JSON Schema for the AsyncAPI contract / CLI codegen.
 *
 * - Standard Schema validators that implement **StandardJSONSchemaV1**
 *   (Zod ≥4.2, ArkType ≥2.1.28, Valibot ≥1.2) convert natively for the given
 *   `io` direction and `target` draft.
 * - Raw TypeBox schemas are already JSON Schema — embedded as-is.
 * - A Standard Schema without JSON-Schema support yields `{}` (runtime
 *   validation still works; the generated type for that message is `unknown`).
 */
export function toJsonSchema(
    schema: AnySchema,
    io: SchemaIO = "output",
    target: JsonSchemaTarget = "draft-07",
): object {
    if (isStandardSchema(schema)) {
        const converter = (
            schema["~standard"] as {
                jsonSchema?: {
                    input?: (o: { target: string }) => object;
                    output?: (o: { target: string }) => object;
                };
            }
        ).jsonSchema;
        const convert = converter?.[io] ?? converter?.output ?? converter?.input;
        if (convert) {
            const { $schema, ...body } = convert({ target }) as Record<
                string,
                unknown
            >;
            return body;
        }
        return {};
    }
    // TypeBox: a TSchema is valid JSON Schema; drop the [Kind] symbols
    return JSON.parse(JSON.stringify(schema)) as object;
}
