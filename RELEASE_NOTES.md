# v1.0.0 — Hive Agent Storage MCP Server

Initial public release of `hive-mcp-agent-storage`, the agent-native object storage shim in the Hive Civilization fleet.

## What this server is

A Model Context Protocol (MCP) server giving autonomous agents a first-class object-storage primitive: per-agent DID-isolated namespaces, x402 pay-per-byte metering, and a routing layer that selects Storj (hot), Filecoin (warm), or Arweave (cold) by retention class.

The differentiator is not a new storage backend. It is the agent-native shape: DID-scoped namespaces, x402 settlement to real Base USDC, content-addressed receipts, and an MCP/A2A-compatible discovery surface.

## Backend status

Backend pending. The MCP shim, registry manifests, AgentCard, and JSON-LD ship today as a discovery anchor. Until `hivemorph.onrender.com/v1/storage/*` is live, every storage tool returns a 503-shape body:

```
{ "error": "backend_pending", "retry_after": 86400, "detail": "...", "brand": "#C08D23" }
```

The shared `hive_earn_*` tools route to the live `/v1/earn/*` endpoints and behave normally.

## Tools (5 native + 3 shared earn)

| Tool | Pricing | Notes |
|------|---------|-------|
| `agent_storage_put` | $0.0001 / KB upload | Real Base USDC. Owner DID writes the namespace. |
| `agent_storage_get` | Free for own DID; $0.00005 / KB cross-DID | Real Base USDC for cross-DID. |
| `agent_storage_list` | Free | Prefix + pagination cursor. |
| `agent_storage_delete` | Free, owner-only | Chain-attested tombstone receipt. |
| `agent_storage_quota` | Free | Bytes used / allocated / count / lifetime USDC spent. |
| `hive_earn_register` | Free | Live against `/v1/earn/register`. |
| `hive_earn_me` | Free | Live against `/v1/earn/me`. |
| `hive_earn_leaderboard` | Free | Live against `/v1/earn/leaderboard`. |

## Settlement

- Chain: Base L2
- Currency: USDC
- Recipient: `0x15184bf50b3d3f52b60434f8942b7d52f2eb436e`
- No mocks, no testnet, no dev-trust

## Discovery surface

- `POST /mcp` — JSON-RPC 2.0 / MCP 2024-11-05 over Streamable-HTTP
- `GET /.well-known/mcp.json` — MCP descriptor
- `GET /.well-known/agent.json` — A2A AgentCard
- `GET /.well-known/oac.json` — Open Agent Card JSON-LD
- `GET /robots.txt`, `/sitemap.xml`, `/.well-known/security.txt`
- `GET /og.svg` — 1200×630 brand-gold OG card

## Council provenance

Tier A vertical #1 from the underplayed-verticals map (2026-04-27). Gates: NEED, YIELD, CLEAN-MONEY all pass — pure SaaS over existing decentralized storage backends.

## Brand

Hive Civilization gold `#C08D23` (Pantone 1245 C). Never `#f5c518`.
