import { z } from "zod";

/**
 * Result type helpers for functional error handling.
 *
 * @module result
 */

/**
 * Zod schema for Result type validation.
 */
export const ResultSchema = <T extends z.ZodTypeAny, E extends z.ZodTypeAny>(
    dataSchema: T,
    errorSchema: E,
) =>
    z.union([
        z.object({
            success: z.literal(true),
            data: dataSchema,
        }),
        z.object({
            success: z.literal(false),
            error: errorSchema,
        }),
    ]);

/**
 * Result type for operations that can fail.
 *
 * @typeParam T - The success data type
 * @typeParam E - The error type (defaults to Error)
 */
export type Result<T, E = Error> =
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: E };

/**
 * Creates a successful result.
 *
 * @param data - The success data
 * @returns A successful Result containing the data
 */
export function succeed<T>(data: T): Result<T, never> {
    return { success: true, data };
}

/**
 * Creates a failed result.
 *
 * @param error - The error that occurred
 * @returns A failed Result containing the error
 */
export function fail<E>(error: E): Result<never, E> {
    return { success: false, error };
}

/**
 * Validates data against a Zod schema and returns a Result.
 *
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @returns A Result containing the validated data or a ZodError
 */
export function validateWithSchema<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
): Result<T, z.ZodError> {
    const result = schema.safeParse(data);

    if (result.success) {
        return succeed(result.data);
    }

    return fail(result.error);
}
