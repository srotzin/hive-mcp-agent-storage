// server.js — Hive Agent Storage MCP Server
//
// Agent-native object storage with per-agent DID isolation and x402
// pay-per-byte metering. Routes to Storj / Filecoin / Arweave under the
// hood. Real Base USDC settlement to the canonical Hive recipient.
//
// Backend status: pending. Until hivemorph.onrender.com/v1/storage/* is
// live, every tool returns HTTP 503 { error: "backend_pending",
// retry_after: 86400 }. The MCP shim, README, smithery.yaml, agent.json,
// and JSON-LD ship today as a discovery anchor.

import express from 'express';
import cors from 'cors';
import { HIVE_EARN_TOOLS, executeHiveEarnTool, isHiveEarnTool } from './hive-earn-tools.js';
import { buildAgentCard, buildOacJsonLd, renderRootHtml } from './hive-agent-card.js';
import { renderLanding, renderRobots, renderSitemap, renderSecurity, renderOgImage, seoJson, BRAND_GOLD } from './meta.js';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.HIVE_BACKEND_URL || 'https://hivemorph.onrender.com';
const PUBLIC_URL = 'https://hive-mcp-agent-storage.onrender.com';
const INTERNAL_KEY = process.env.INTERNAL_KEY || '';

// Backend pending flag — flip to false when /v1/storage/* is live.
const BACKEND_PENDING = true;

const PENDING_BODY = {
  error: 'backend_pending',
  detail: 'Hive Agent Storage backend endpoints (/v1/storage/*) are not yet live. The MCP shim, registry manifests, and discovery surface are published as an anchor; tool execution returns 503 until the backend ships.',
  retry_after: 86400,
  brand: '#C08D23',
  status_url: 'https://github.com/srotzin/hive-mcp-agent-storage/releases',
};

app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// ─── Health ─────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'hive-mcp-agent-storage',
    version: '1.0.0',
    description: 'Agent-native object storage MCP shim. Per-agent DID isolation, x402 pay-per-byte metering. Routes to Storj / Filecoin / Arweave.',
    backend_pending: BACKEND_PENDING,
    upstream: BASE_URL,
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// ─── MCP Tools ──────────────────────────────────────────────────────────────
const MCP_TOOLS = [
  {
    name: 'agent_storage_put',
    description:
      'Upload bytes to agent-isolated object storage. Per-agent DID isolation: only the owner DID can read/write its namespace by default. Settles in real Base USDC at $0.0001/KB on upload. Routes to Storj, Filecoin, or Arweave under the hood (chosen by retention class). Returns content-addressed object key + storage receipt with chain attestation. Backend pending — currently returns 503.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      required: ['agent_did', 'key', 'content'],
      properties: {
        agent_did: { type: 'string', description: 'Owner agent DID (did:hive:... or did:web:...). Defines the storage namespace.' },
        key: { type: 'string', description: 'Object key inside the agent namespace (e.g. "memory/2026-04-27.jsonl"). Must not start with "/".' },
        content: { type: 'string', description: 'Object content. Plain text or base64 (set content_encoding accordingly).' },
        content_encoding: { type: 'string', description: 'One of "utf8" or "base64". Default "utf8".', enum: ['utf8', 'base64'] },
        content_type: { type: 'string', description: 'Optional MIME type (e.g. "application/json", "image/png").' },
        retention_class: { type: 'string', description: 'Storage backend hint: "hot" (Storj), "warm" (Filecoin), "cold" (Arweave permanent). Default "hot".', enum: ['hot', 'warm', 'cold'] },
        api_key: { type: 'string', description: 'Agent API key for authentication. Optional if agent_did is registered with HiveGate.' },
      },
    },
    pricing: {
      amount: '0.0001',
      currency: 'USDC',
      chain: 'base',
      recipient: '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e',
      unit: 'per KB',
      note: 'Real Base USDC, paid per KB uploaded. Backend pending.',
    },
  },
  {
    name: 'agent_storage_get',
    description:
      'Read an object from agent-isolated storage. Free for own DID; cross-DID reads cost $0.00005/KB in real Base USDC (settled per KB read). Returns the object bytes + storage receipt + chain attestation. Backend pending — currently returns 503.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      required: ['agent_did', 'key'],
      properties: {
        agent_did: { type: 'string', description: 'Owner agent DID for the object namespace being read.' },
        key: { type: 'string', description: 'Object key inside the agent namespace.' },
        caller_did: { type: 'string', description: 'Calling agent DID. If different from agent_did, cross-DID read pricing applies.' },
        api_key: { type: 'string', description: 'Caller API key.' },
      },
    },
    pricing: {
      amount: '0.00005',
      currency: 'USDC',
      chain: 'base',
      recipient: '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e',
      unit: 'per KB (cross-DID only)',
      note: 'Free for own DID. Cross-DID reads paid per KB. Backend pending.',
    },
  },
  {
    name: 'agent_storage_list',
    description:
      'List objects inside an agent storage namespace. Free read. Supports key prefix filtering and pagination cursor. Backend pending — currently returns 503.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      required: ['agent_did'],
      properties: {
        agent_did: { type: 'string', description: 'Agent DID whose namespace to list.' },
        prefix: { type: 'string', description: 'Optional key prefix filter (e.g. "memory/").' },
        cursor: { type: 'string', description: 'Pagination cursor returned from a prior list call.' },
        limit: { type: 'integer', description: 'Maximum keys to return. Default 100, max 1000.' },
        api_key: { type: 'string', description: 'Caller API key.' },
      },
    },
    pricing: {
      amount: '0',
      currency: 'USDC',
      chain: 'base',
      recipient: '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e',
      note: 'Free read.',
    },
  },
  {
    name: 'agent_storage_delete',
    description:
      'Delete an object from agent storage. Owner-only — only the agent_did that owns the namespace can delete. Free. Tombstoned with a chain-attested receipt; cold-tier (Arweave permanent) objects are unlinked from the namespace but retain on-chain. Backend pending — currently returns 503.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      required: ['agent_did', 'key', 'api_key'],
      properties: {
        agent_did: { type: 'string', description: 'Owner agent DID. Must match the namespace owner.' },
        key: { type: 'string', description: 'Object key to delete.' },
        api_key: { type: 'string', description: 'Owner API key. Required for delete.' },
      },
    },
    pricing: {
      amount: '0',
      currency: 'USDC',
      chain: 'base',
      recipient: '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e',
      note: 'Free, owner-only.',
    },
  },
  {
    name: 'agent_storage_quota',
    description:
      'Return the current quota usage for an agent namespace: bytes used, bytes allocated, object count, retention-class breakdown, and lifetime USDC spent on this namespace. Free read. Backend pending — currently returns 503.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      required: ['agent_did'],
      properties: {
        agent_did: { type: 'string', description: 'Agent DID whose quota to inspect.' },
        api_key: { type: 'string', description: 'Caller API key.' },
      },
    },
    pricing: {
      amount: '0',
      currency: 'USDC',
      chain: 'base',
      recipient: '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e',
      note: 'Free read.',
    },
  },
];

// ─── Agent-native config (A2A AgentCard + OAC JSON-LD + earn rails) ───────
const HIVE_AGENT_CFG = {
  name: 'Hive Agent Storage MCP',
  description:
    'Agent-native object storage MCP server with per-agent DID isolation and x402 pay-per-byte metering. Routes to Storj, Filecoin, and Arweave under the hood. Real Base USDC settlement, no mocks, no testnet. Part of Hive Civilization.',
  url: PUBLIC_URL,
  version: '1.0.0',
  repoUrl: 'https://github.com/srotzin/hive-mcp-agent-storage',
  did: 'did:hive:agent-storage',
  gatewayUrl: 'https://hive-mcp-gateway.onrender.com',
  tools: [],
};

const SERVICE_CFG = {
  service: 'hive-mcp-agent-storage',
  shortName: 'Hive Agent Storage',
  title: 'Hive Agent Storage · Agent-Native Object Storage MCP',
  tagline: 'Per-agent DID-isolated object storage. x402 pay-per-byte. Real Base USDC.',
  description:
    'MCP server for Hive Agent Storage — agent-native object storage with per-agent DID isolation and x402 pay-per-byte metering. Routes to Storj, Filecoin, and Arweave under the hood. Real Base USDC settlement to 0x15184bf50b3d3f52b60434f8942b7d52f2eb436e. No mocks, no testnet, no dev-trust.',
  keywords: [
    'mcp', 'model-context-protocol', 'x402', 'a2a', 'agentic', 'ai-agent',
    'autonomous-agent', 'hive', 'hive-civilization', 'agent-storage',
    'object-storage', 'agent-data', 'decentralized-storage',
    'storj-compatible', 'filecoin-compatible', 'arweave-compatible',
    'did-isolation', 'usdc', 'base', 'base-l2', 'real-rails',
  ],
  externalUrl: PUBLIC_URL,
  gatewayMount: '/agent-storage',
  version: '1.0.0',
  pricing: [
    { name: 'agent_storage_put', priceUsd: 0.0001, label: 'Put — $0.0001/KB upload (real Base USDC)' },
    { name: 'agent_storage_get', priceUsd: 0.00005, label: 'Get — free for own DID, $0.00005/KB cross-DID' },
    { name: 'agent_storage_list', priceUsd: 0, label: 'List — free' },
    { name: 'agent_storage_delete', priceUsd: 0, label: 'Delete — free, owner-only' },
    { name: 'agent_storage_quota', priceUsd: 0, label: 'Quota — free' },
  ],
};
SERVICE_CFG.tools = MCP_TOOLS.map(t => ({ name: t.name, description: t.description }));

// Merge in shared earn tools.
for (const t of HIVE_EARN_TOOLS) {
  if (!MCP_TOOLS.find(x => x.name === t.name)) MCP_TOOLS.push(t);
}
HIVE_AGENT_CFG.tools = MCP_TOOLS;

// ─── MCP Prompts ────────────────────────────────────────────────────────────
const MCP_PROMPTS = [
  {
    name: 'put_agent_object',
    description: 'Walk through uploading an object to your agent-isolated storage namespace, picking a retention class, and confirming the x402 settlement.',
    arguments: [
      { name: 'agent_did', description: 'Owner agent DID for the storage namespace', required: false },
    ],
  },
  {
    name: 'get_agent_object',
    description: 'Fetch an object from agent storage. Same-DID reads are free; cross-DID reads incur per-KB pricing in real Base USDC.',
    arguments: [
      { name: 'agent_did', description: 'Owner agent DID', required: false },
      { name: 'key', description: 'Object key', required: false },
    ],
  },
  {
    name: 'check_agent_quota',
    description: 'Inspect bytes used / allocated, object count, and lifetime spend for an agent storage namespace.',
    arguments: [
      { name: 'agent_did', description: 'Agent DID', required: false },
    ],
  },
];

// ─── Config Schema ───────────────────────────────────────────────────────────
const MCP_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    did: { type: 'string', title: 'Agent DID', 'x-order': 0 },
    api_key: { type: 'string', title: 'API Key', 'x-sensitive': true, 'x-order': 1 },
    default_retention: {
      type: 'string',
      title: 'Default Retention Class',
      enum: ['hot', 'warm', 'cold'],
      default: 'hot',
      'x-order': 2,
    },
  },
  required: [],
};

function pendingPayload(toolName, args) {
  return {
    ...PENDING_BODY,
    tool: toolName,
    received_args: args || {},
  };
}

// ─── MCP Handler ─────────────────────────────────────────────────────────────
app.post('/mcp', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (jsonrpc !== '2.0') {
    return res.json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid JSON-RPC' } });
  }
  try {
    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: false },
            prompts: { listChanged: false },
            resources: { listChanged: false },
          },
          serverInfo: {
            name: 'hive-mcp-agent-storage',
            version: '1.0.0',
            description:
              'Agent-native object storage MCP shim. Per-agent DID isolation, x402 pay-per-byte metering. Routes to Storj / Filecoin / Arweave. Real Base USDC settlement. Backend pending.',
            homepage: PUBLIC_URL,
            icon: 'https://www.thehiveryiq.com/favicon.ico',
          },
          configSchema: MCP_CONFIG_SCHEMA,
        },
      });
    }

    if (method === 'tools/list') {
      return res.json({ jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } });
    }

    if (method === 'prompts/list') {
      return res.json({ jsonrpc: '2.0', id, result: { prompts: MCP_PROMPTS } });
    }

    if (method === 'prompts/get') {
      const prompt = MCP_PROMPTS.find(p => p.name === params?.name);
      if (!prompt) {
        return res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: `Prompt not found: ${params?.name}` } });
      }
      const args = params?.arguments || {};
      const messages = {
        put_agent_object: [{ role: 'user', content: { type: 'text', text: `Help me upload an object to Hive Agent Storage${args.agent_did ? ` under DID ${args.agent_did}` : ''}. Walk me through choosing a retention class (hot/warm/cold), the per-KB pricing in real Base USDC, and the x402 settlement. Note that the backend is still pending.` } }],
        get_agent_object: [{ role: 'user', content: { type: 'text', text: `Read object${args.key ? ` "${args.key}"` : ''} from Hive Agent Storage${args.agent_did ? ` namespace ${args.agent_did}` : ''}. Explain when same-DID reads are free vs. cross-DID per-KB pricing. Note that the backend is still pending.` } }],
        check_agent_quota: [{ role: 'user', content: { type: 'text', text: `Show the storage quota for${args.agent_did ? ` ${args.agent_did}` : ' my agent DID'}: bytes used, bytes allocated, object count, retention-class breakdown, and lifetime USDC spent. Note that the backend is still pending.` } }],
      };
      return res.json({ jsonrpc: '2.0', id, result: { messages: messages[prompt.name] || [] } });
    }

    if (method === 'resources/list') {
      return res.json({
        jsonrpc: '2.0', id,
        result: {
          resources: [
            { uri: 'hivestorage://health', name: 'Storage Service Health', description: 'Health of the Hive Agent Storage MCP shim.', mimeType: 'application/json' },
            { uri: 'hivestorage://backend/status', name: 'Backend Status', description: 'Status of the upstream /v1/storage/* backend.', mimeType: 'application/json' },
          ],
        },
      });
    }

    if (method === 'resources/read') {
      const uri = params?.uri;
      let data;
      if (uri === 'hivestorage://health') {
        data = { status: 'ok', service: 'hive-mcp-agent-storage', backend_pending: BACKEND_PENDING };
      } else if (uri === 'hivestorage://backend/status') {
        data = { ...PENDING_BODY, upstream: BASE_URL };
      } else {
        return res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown resource: ${uri}` } });
      }
      return res.json({ jsonrpc: '2.0', id, result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] } });
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      // Earn tools first (live against /v1/earn/*).
      if (isHiveEarnTool(name)) {
        const earnOut = await executeHiveEarnTool(name, args || {});
        if (earnOut) return res.json({ jsonrpc: '2.0', id, result: { content: [earnOut] } });
      }

      const validTool = MCP_TOOLS.find(t => t.name === name);
      if (!validTool) {
        return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${name}` } });
      }

      // Backend pending: return 503-shape payload for every storage tool.
      if (BACKEND_PENDING) {
        return res.json({
          jsonrpc: '2.0', id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(pendingPayload(name, args), null, 2) }],
            isError: true,
          },
        });
      }

      // When backend ships, route to /v1/storage/*.
      const headers = {
        'Content-Type': 'application/json',
        'x-hive-did': args?.agent_did || args?.caller_did || args?.did || '',
        'x-api-key': args?.api_key || '',
        'x-internal-key': INTERNAL_KEY,
      };
      const toolRoutes = {
        agent_storage_put: () => fetch(`${BASE_URL}/v1/storage/put`, { method: 'POST', headers, body: JSON.stringify(args) }).then(r => r.json()),
        agent_storage_get: () => fetch(`${BASE_URL}/v1/storage/get`, { method: 'POST', headers, body: JSON.stringify(args) }).then(r => r.json()),
        agent_storage_list: () => {
          const qs = new URLSearchParams({
            agent_did: args?.agent_did || '',
            ...(args?.prefix ? { prefix: args.prefix } : {}),
            ...(args?.cursor ? { cursor: args.cursor } : {}),
            ...(args?.limit ? { limit: String(args.limit) } : {}),
          });
          return fetch(`${BASE_URL}/v1/storage/list?${qs}`, { headers }).then(r => r.json());
        },
        agent_storage_delete: () => fetch(`${BASE_URL}/v1/storage/delete`, { method: 'POST', headers, body: JSON.stringify(args) }).then(r => r.json()),
        agent_storage_quota: () => fetch(`${BASE_URL}/v1/storage/quota?agent_did=${encodeURIComponent(args?.agent_did || '')}`, { headers }).then(r => r.json()),
      };
      const data = await toolRoutes[name]();
      return res.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] } });
    }

    if (method === 'ping') return res.json({ jsonrpc: '2.0', id, result: {} });
    return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });

  } catch (err) {
    return res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } });
  }
});

app.get('/.well-known/mcp.json', (req, res) => res.json({
  name: 'hive-mcp-agent-storage',
  version: '1.0.0',
  description: 'Agent-native object storage MCP shim with per-agent DID isolation and x402 pay-per-byte metering.',
  endpoint: '/mcp',
  transport: 'streamable-http',
  protocol: '2024-11-05',
  homepage: PUBLIC_URL,
  icon: 'https://www.thehiveryiq.com/favicon.ico',
  backend_pending: BACKEND_PENDING,
  tools: MCP_TOOLS.map(t => ({ name: t.name, description: t.description })),
  prompts: MCP_PROMPTS.map(p => ({ name: p.name, description: p.description })),
}));

// ─── Landing + crawler discovery ────────────────────────────────────────────
app.get('/', (req, res) => {
  const __landing = renderLanding(SERVICE_CFG);
  const __oacLd = JSON.stringify(buildOacJsonLd(HIVE_AGENT_CFG)).replace(/</g, '\\u003c');
  const __ldTag = '\n<script type="application/ld+json">' + __oacLd + '</script>\n';
  const __out = __landing.replace('</head>', __ldTag + '</head>');
  res.type('text/html; charset=utf-8').send(__out);
});
app.get('/og.svg', (req, res) => res.type('image/svg+xml').send(renderOgImage(SERVICE_CFG)));
app.get('/robots.txt', (req, res) => res.type('text/plain').send(renderRobots(SERVICE_CFG)));
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(renderSitemap(SERVICE_CFG)));
app.get('/.well-known/security.txt', (req, res) => res.type('text/plain').send(renderSecurity()));
app.get('/seo.json', (req, res) => res.json(seoJson(SERVICE_CFG)));

// ─── A2A AgentCard + OAC JSON-LD ───────────────────────────────────────────
app.get('/.well-known/agent.json', (req, res) => res.json(buildAgentCard(HIVE_AGENT_CFG)));
app.get('/agent.json', (req, res) => res.json(buildAgentCard(HIVE_AGENT_CFG)));
app.get('/.well-known/oac.json', (req, res) => res.json(buildOacJsonLd(HIVE_AGENT_CFG)));
app.get('/agent.html', (req, res) => res.type('text/html; charset=utf-8').send(renderRootHtml(HIVE_AGENT_CFG)));

app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    error: 'NOT_FOUND',
    detail: `Route ${req.method} ${req.path} not found`,
    available: ['GET /health', 'POST /mcp', 'GET /.well-known/mcp.json', 'GET /.well-known/agent.json', 'GET /'],
  });
});


// ─── Schema discoverability ────────────────────────────────────────────────
const AGENT_CARD = {
  name: SERVICE,
  description: `MCP server for Hive Agent Storage — agent-native object storage with per-agent DID isolation and x402 pay-per-byte metering. Routes to Storj, Filecoin, and Arweave under the hood. Real Base USDC settlement.. New agents: first call free. Loyalty: every 6th paid call is free. Pay in USDC on Base L2.`,
  url: `https://${SERVICE}.onrender.com`,
  provider: {
    organization: 'Hive Civilization',
    url: 'https://www.thehiveryiq.com',
    contact: 'steve@thehiveryiq.com',
  },
  version: VERSION,
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  authentication: {
    schemes: ['x402'],
    credentials: {
      type: 'x402',
      asset: 'USDC',
      network: 'base',
      asset_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      recipient: '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e',
    },
  },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
  skills: TOOLS.map(t => ({ name: t.name, description: t.description })),
  extensions: {
    hive_pricing: {
      currency: 'USDC',
      network: 'base',
      model: 'per_call',
      first_call_free: true,
      loyalty_threshold: 6,
      loyalty_message: 'Every 6th paid call is free',
    },
  },
};

const AP2 = {
  ap2_version: '1',
  agent: {
    name: SERVICE,
    did: `did:web:${SERVICE}.onrender.com`,
    description: `MCP server for Hive Agent Storage — agent-native object storage with per-agent DID isolation and x402 pay-per-byte metering. Routes to Storj, Filecoin, and Arweave under the hood. Real Base USDC settlement.. New agents: first call free. Loyalty: every 6th paid call is free. Pay in USDC on Base L2.`,
  },
  endpoints: {
    mcp: `https://${SERVICE}.onrender.com/mcp`,
    agent_card: `https://${SERVICE}.onrender.com/.well-known/agent-card.json`,
  },
  payments: {
    schemes: ['x402'],
    primary: {
      scheme: 'x402',
      network: 'base',
      asset: 'USDC',
      asset_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      recipient: '0x15184bf50b3d3f52b60434f8942b7d52f2eb436e',
    },
  },
  brand: { color: '#C08D23', name: 'Hive Civilization' },
};

app.get('/.well-known/agent-card.json', (req, res) => res.json(AGENT_CARD));
app.get('/.well-known/ap2.json', (req, res) => res.json(AP2));


app.listen(PORT, '0.0.0.0', () => {
  console.log(`[hive-mcp-agent-storage] Running on port ${PORT}`);
  console.log(`[hive-mcp-agent-storage] MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`[hive-mcp-agent-storage] Upstream backend: ${BASE_URL} (pending=${BACKEND_PENDING})`);
});

export default app;
