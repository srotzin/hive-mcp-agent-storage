<!-- HIVE_BANNER_V1 -->
<p align="center">
  <a href="https://hive-mcp-agent-storage.onrender.com/health">
    <img src="https://hive-mcp-agent-storage.onrender.com/og.svg" alt="Hive Agent Storage · Agent-Native Object Storage MCP" width="100%"/>
  </a>
</p>

<h1 align="center">hive-mcp-agent-storage</h1>

<p align="center"><strong>Agent-native object storage MCP server. Per-agent DID isolation. x402 pay-per-byte. Real Base USDC.</strong></p>

<p align="center">
  <a href="https://smithery.ai/server/hivecivilization"><img alt="Smithery" src="https://img.shields.io/badge/Smithery-hivecivilization-C08D23?style=flat-square"/></a>
  <a href="https://glama.ai/mcp/servers"><img alt="Glama" src="https://img.shields.io/badge/Glama-pending-C08D23?style=flat-square"/></a>
  <a href="https://hive-mcp-agent-storage.onrender.com/health"><img alt="Backend" src="https://img.shields.io/badge/backend-pending-C08D23?style=flat-square"/></a>
  <a href="https://github.com/srotzin/hive-mcp-agent-storage/releases"><img alt="Release" src="https://img.shields.io/github/v/release/srotzin/hive-mcp-agent-storage?style=flat-square&color=C08D23"/></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-C08D23?style=flat-square"/></a>
</p>

<p align="center">
  <code>https://hive-mcp-agent-storage.onrender.com/mcp</code>
</p>

---

# Hive Agent Storage

**Agent-native object storage with per-agent DID isolation and x402 pay-per-byte metering.**

`hive-mcp-agent-storage` is a Model Context Protocol (MCP) server that gives autonomous agents a first-class object-storage primitive. Each agent gets its own DID-isolated namespace; reads inside the namespace are free, writes are metered per KB in real Base USDC, and cross-DID reads are metered per KB. Storage is routed under the hood to Storj (hot), Filecoin (warm), or Arweave (cold) depending on retention class.

The differentiator is not a new storage backend. It is the agent-native shape: DID-scoped namespaces, x402 settlement, content-addressed receipts, and an MCP/A2A-compatible discovery surface.

- **Protocol:** MCP 2024-11-05 over Streamable-HTTP / JSON-RPC 2.0
- **A2A:** AgentCard at `/.well-known/agent.json`
- **x402:** every paid call settles in real Base USDC to `0x15184bf50b3d3f52b60434f8942b7d52f2eb436e`
- **Rails:** USDC on Base L2 — no mocks, no testnet, no dev-trust
- **Author:** Steve Rotzin · Hive Civilization · brand gold `#C08D23` (Pantone 1245 C)

## Backend status — pending

The MCP shim, registry manifests, AgentCard, and JSON-LD ship today as a discovery anchor. The upstream backend at `hivemorph.onrender.com/v1/storage/*` is not yet live. Until it ships, every storage tool returns a 503-shape body:

```json
{
  "error": "backend_pending",
  "retry_after": 86400,
  "detail": "Hive Agent Storage backend endpoints (/v1/storage/*) are not yet live...",
  "brand": "#C08D23"
}
```

The shared `hive_earn_*` tools route to live `/v1/earn/*` endpoints and behave normally.

## Tools

| Tool | Purpose | Pricing |
|------|---------|---------|
| `agent_storage_put` | Upload bytes into an agent-isolated namespace. Choose hot/warm/cold retention class. | $0.0001/KB upload, real Base USDC |
| `agent_storage_get` | Read an object. Free for own DID. | $0.00005/KB cross-DID, real Base USDC |
| `agent_storage_list` | List object keys with prefix + pagination. | Free |
| `agent_storage_delete` | Tombstone an object (owner-only). | Free |
| `agent_storage_quota` | Bytes used / allocated / object count / lifetime spend. | Free |

Plus the standard Hive earn rails: `hive_earn_register`, `hive_earn_me`, `hive_earn_leaderboard`.

## Endpoints

| Path | Purpose |
|------|---------|
| `POST /mcp` | JSON-RPC 2.0 / MCP 2024-11-05 |
| `GET  /` | HTML landing with comprehensive meta tags + JSON-LD |
| `GET  /health` | Health + telemetry |
| `GET  /.well-known/mcp.json` | MCP discovery descriptor |
| `GET  /.well-known/agent.json` | A2A AgentCard |
| `GET  /.well-known/oac.json` | Open Agent Card JSON-LD |
| `GET  /.well-known/security.txt` | RFC 9116 security contact |
| `GET  /robots.txt` | Allow-all crawl policy |
| `GET  /sitemap.xml` | Crawler sitemap |
| `GET  /og.svg` | 1200×630 Hive-gold OG image |
| `GET  /seo.json` | JSON-LD structured data (SoftwareApplication) |

## Connect

Claude Desktop / Cursor / Manus and other MCP clients can mount the server via Streamable-HTTP:

```json
{
  "mcpServers": {
    "hive-agent-storage": {
      "url": "https://hive-mcp-agent-storage.onrender.com/mcp"
    }
  }
}
```

Smithery one-click install: `https://smithery.ai/server/hivecivilization` (server: `hive-mcp-agent-storage`).

## Architecture

```
       MCP / A2A clients
            │
            ▼
  hive-mcp-agent-storage  (this repo)
            │  per-agent DID isolation
            │  x402 metering shim
            ▼
   /v1/storage/*  (hivemorph.onrender.com — pending)
            │
            ├─ Storj      (hot, frequent access)
            ├─ Filecoin   (warm, periodic access)
            └─ Arweave    (cold, permanent)
```

Per-agent DID isolation means:

- The agent's DID is the namespace key. Reads/writes inside the namespace require an API key bound to that DID at HiveGate.
- Cross-DID reads are explicitly metered and audited; there is no implicit trust.
- Tombstone receipts are chain-attested; cold-tier (Arweave) deletes unlink from the namespace but the object remains on-chain by design.

## License

MIT. © Steve Rotzin / Hive Civilization. Brand gold `#C08D23` (Pantone 1245 C). Never `#f5c518`.

## Agent-native (v1.0.0)

This shim ships the Hive Civilization agent-native bundle so any A2A or MCP-aware agent can discover, pay, and earn:

- **A2A AgentCard** — `GET /.well-known/agent.json` (also at `/agent.json`).
- **Open Agent Card (OAC) JSON-LD** — embedded inline at `/` and `/agent.html`, with `@type SoftwareApplication` + `@type AgentCard` under `@context` `https://schema.org` + `https://a2a-protocol.org/v1`.
- **Earn rails** — `hive_earn_register`, `hive_earn_me`, `hive_earn_leaderboard` against `https://hivemorph.onrender.com/v1/earn/*`. Resilient to upstream cold-start.
- **x402 propagation** — paid responses pass through the upstream 402 body untouched so the consuming agent can auto-pay.
- **Pricing annotations** — every paid tool descriptor carries a non-standard `pricing` block (amount / currency / chain / recipient) ahead of MCP-next.
- Brand: Hive Civilization gold `#C08D23`. Settlement: real Base USDC, recipient `0x15184bf50b3d3f52b60434f8942b7d52f2eb436e`. No mock, no testnet.
