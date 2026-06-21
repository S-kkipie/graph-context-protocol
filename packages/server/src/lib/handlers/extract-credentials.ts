/**
 * Shared credential extraction for protocol handlers.
 *
 * Credentials are read from the inbound envelope metadata first, then the
 * message header metadata, under either `gcp.credentials` or `auth`.
 *
 * @module handlers/extract-credentials
 */

import type { ProtocolMessage } from "@graph-context-protocol/core";
import type { Credentials } from "../auth/types";
import type { HandlerContext } from "./types";

const METADATA_CREDENTIALS_KEY = "gcp.credentials" as const;
const METADATA_AUTH_KEY = "auth" as const;

function normalizeCredentials(raw: unknown): Credentials | undefined {
    if (
        typeof raw === "object" &&
        raw !== null &&
        "type" in raw &&
        "value" in raw &&
        typeof (raw as Record<string, unknown>).type === "string"
    ) {
        return raw as Credentials;
    }

    return undefined;
}

/**
 * Extracts caller credentials from the inbound envelope or message header.
 *
 * @param context - The handler context (its `inboundMetadata` is checked first)
 * @param message - The protocol message (its header metadata is the fallback)
 * @returns The normalized credentials, or undefined if none are present
 */
export function extractCredentials(
    context: HandlerContext,
    message: ProtocolMessage,
): Credentials | undefined {
    const raw =
        context.inboundMetadata[METADATA_CREDENTIALS_KEY] ??
        context.inboundMetadata[METADATA_AUTH_KEY];

    if (raw !== undefined) {
        return normalizeCredentials(raw);
    }

    const headerRaw =
        message.header.metadata[METADATA_CREDENTIALS_KEY] ??
        message.header.metadata[METADATA_AUTH_KEY];

    if (headerRaw !== undefined) {
        return normalizeCredentials(headerRaw);
    }

    return undefined;
}
