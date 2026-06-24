import { describe, expect, it } from "vitest";
import {
    measureA2aDiscovery,
    measureGcpDiscovery,
    type PeerLocator,
} from "./discovery";

const peers = (count: number): PeerLocator[] =>
    Array.from({ length: count }, (_v, i) => ({
        peerId: `knowledge:seller-s${i}`,
        knowledgeNodeId: `knowledge:seller-s${i}`,
        url: `http://gcp/seller-s${i}`,
    }));

const cardUrls = (count: number): string[] =>
    Array.from(
        { length: count },
        (_v, i) => `http://127.0.0.1:90${i}/.well-known/agent-card.json`,
    );

const okFetch = (async () =>
    new Response("{}", { status: 200 })) as unknown as typeof fetch;

describe("measureGcpDiscovery", () => {
    it("resolves the whole peer set in ONE substrate query (O(1))", () => {
        const r = measureGcpDiscovery(peers(5));
        expect(r.discoveryMessages).toBe(1);
        expect(r.peersDiscovered).toBe(5);
    });

    it("stays at one discovery message as N grows", () => {
        expect(measureGcpDiscovery(peers(2)).discoveryMessages).toBe(1);
        expect(measureGcpDiscovery(peers(50)).discoveryMessages).toBe(1);
    });

    it("discovers nothing from an empty federation but still pays one query", () => {
        expect(measureGcpDiscovery([])).toEqual({
            discoveryMessages: 1,
            peersDiscovered: 0,
        });
    });
});

describe("measureA2aDiscovery", () => {
    it("fetches one agent card per peer (O(N))", async () => {
        const seen: string[] = [];
        const spyFetch = (async (u: string | URL | Request) => {
            seen.push(String(u));
            return new Response("{}", { status: 200 });
        }) as unknown as typeof fetch;
        const r = await measureA2aDiscovery(cardUrls(5), spyFetch);
        expect(r.discoveryMessages).toBe(5);
        expect(r.peersDiscovered).toBe(5);
        expect(seen).toHaveLength(5);
    });

    it("scales discovery messages linearly with N", async () => {
        expect(
            (await measureA2aDiscovery(cardUrls(2), okFetch)).discoveryMessages,
        ).toBe(2);
        expect(
            (await measureA2aDiscovery(cardUrls(20), okFetch))
                .discoveryMessages,
        ).toBe(20);
    });

    it("counts an attempted message even when a card is unreachable", async () => {
        const flakyFetch = (async (u: string | URL | Request) =>
            String(u).includes("down")
                ? Promise.reject(new Error("ECONNREFUSED"))
                : new Response("{}", {
                      status: 200,
                  })) as unknown as typeof fetch;
        const urls = [
            "http://127.0.0.1:9001/up/.well-known/agent-card.json",
            "http://127.0.0.1:9002/down/.well-known/agent-card.json",
        ];
        const r = await measureA2aDiscovery(urls, flakyFetch);
        expect(r.discoveryMessages).toBe(2);
        expect(r.peersDiscovered).toBe(1);
    });
});
