---
title: Connect your AI agent over MCP
description: Add docolin to Claude Code, Cursor, VS Code, ChatGPT, and any other MCP client, so your agent grounds its answers in verified, attributed docs.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/mcp/connect
  type: how-to

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 5m

  status: stable

  aliases:
    - connect mcp
    - add docolin to claude code
    - add docolin to cursor
    - docolin mcp setup
    - mcp client configuration
---

# Connect your AI agent over MCP

docolin speaks [MCP](https://modelcontextprotocol.io), so an AI agent can search, read, and verify docolin docs as it works, and cite the author of every doco it uses. This page is how you connect one to Pango's commons.

There is one endpoint:

```
https://docolin.com/api/mcp
```

It is a **Streamable HTTP** server (JSON-RPC over POST). Two things make it easy to add:

!!! info "Read-only and public; the token is optional"
    The endpoint is public and read-only, so you can connect with **no account and no token** and your agent can immediately search, browse, fetch, and read discussions. A personal token is only for _signed verification_: when your agent confirms a doco worked on a real system, the token attaches that to your account. Create one on the [MCP dashboard](/dashboard/mcp). Every config below shows the token; drop the `Authorization` header to connect read-only.

## Two things worth knowing first

These are where most connections break:

1. **The config keys differ per client and are not interchangeable.** Most use `mcpServers`, but VS Code uses `servers`, opencode uses `mcp`, Zed uses `context_servers`. The URL field is usually `url`, but Windsurf uses `serverUrl`, and Gemini CLI and Qwen Code use `httpUrl` (their `url` means the deprecated SSE transport). Copy from the right client below, not from another's docs.
2. **docolin uses a plain Bearer token, not OAuth.** That means the static `Authorization: Bearer ...` header works on every client that has a header field. A few clients (Claude Desktop, ChatGPT) have no header field, see [clients without a header field](#clients-without-a-header-field) for those.

## Pick your client

=== "Claude Code"
    ```bash
    claude mcp add --transport http docolin https://docolin.com/api/mcp \
      --header "Authorization: Bearer doco_mcp_YOUR_TOKEN"
    ```

    Or edit `.mcp.json` (shared with a project) or `~/.claude.json` (just you):

    ```json
    {
      "mcpServers": {
        "docolin": {
          "type": "http",
          "url": "https://docolin.com/api/mcp",
          "headers": { "Authorization": "Bearer doco_mcp_YOUR_TOKEN" }
        }
      }
    }
    ```

=== "Cursor"
    Edit `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project). The transport is inferred from `url`:

    ```json
    {
      "mcpServers": {
        "docolin": {
          "url": "https://docolin.com/api/mcp",
          "headers": { "Authorization": "Bearer doco_mcp_YOUR_TOKEN" }
        }
      }
    }
    ```

=== "VS Code"
    GitHub Copilot reads `.vscode/mcp.json`. Note the top-level key is `servers`, not `mcpServers`, and the transport is `"type": "http"`:

    ```json
    {
      "servers": {
        "docolin": {
          "type": "http",
          "url": "https://docolin.com/api/mcp",
          "headers": { "Authorization": "Bearer doco_mcp_YOUR_TOKEN" }
        }
      }
    }
    ```

=== "Cline"
    Edit `cline_mcp_settings.json` (or `~/.cline/mcp.json`). Set the transport explicitly so it does not fall back to SSE:

    ```json
    {
      "mcpServers": {
        "docolin": {
          "type": "streamableHttp",
          "url": "https://docolin.com/api/mcp",
          "headers": { "Authorization": "Bearer doco_mcp_YOUR_TOKEN" }
        }
      }
    }
    ```

=== "Windsurf"
    Edit `~/.codeium/windsurf/mcp_config.json`. The URL field is `serverUrl`, not `url`:

    ```json
    {
      "mcpServers": {
        "docolin": {
          "serverUrl": "https://docolin.com/api/mcp",
          "headers": { "Authorization": "Bearer doco_mcp_YOUR_TOKEN" }
        }
      }
    }
    ```

=== "Codex CLI"
    OpenAI Codex uses TOML at `~/.codex/config.toml`, and sources the token from an environment variable:

    ```toml
    [mcp_servers.docolin]
    url = "https://docolin.com/api/mcp"
    bearer_token_env_var = "DOCOLIN_TOKEN"
    ```

    Then `export DOCOLIN_TOKEN="doco_mcp_YOUR_TOKEN"`.

=== "Gemini CLI"
    Edit `~/.gemini/settings.json`. Use `httpUrl` for Streamable HTTP (plain `url` selects the deprecated SSE transport):

    ```json
    {
      "mcpServers": {
        "docolin": {
          "httpUrl": "https://docolin.com/api/mcp",
          "headers": { "Authorization": "Bearer doco_mcp_YOUR_TOKEN" }
        }
      }
    }
    ```

## Clients without a header field

Claude Desktop and ChatGPT add remote MCP servers through a UI that has no field for a custom header (they support OAuth or authless servers only). You have two options:

- **Connect read-only.** Add `https://docolin.com/api/mcp` with no authentication. Your agent reads everything; it just cannot record signed verifications.
- **Use the `mcp-remote` bridge** (below) if you want signed verification.

=== "Claude Desktop"
    For read-only, open Settings > Connectors > Add custom connector and paste the URL. For a token, use the bridge in `claude_desktop_config.json`:

    ```json
    {
      "mcpServers": {
        "docolin": {
          "command": "npx",
          "args": ["mcp-remote", "https://docolin.com/api/mcp", "--header", "Authorization:${DOCOLIN_AUTH}"],
          "env": { "DOCOLIN_AUTH": "Bearer doco_mcp_YOUR_TOKEN" }
        }
      }
    }
    ```

    !!! note "Why the odd `--header` form"
        The header value is passed through `env` with no space around the colon to dodge an argument-escaping bug on Claude Desktop. The bridge also runs locally, so the server does not need to be reachable from Anthropic's cloud.

=== "ChatGPT"
    Turn on Developer Mode (Settings > Apps & Connectors > Advanced), then Add custom connector and paste the URL. There is no static-header field, so connect read-only. Developer Mode requires an eligible paid plan; check OpenAI's help center for current eligibility.

## The `mcp-remote` bridge (universal fallback)

Any client that can run a local command but cannot send a custom header on a remote URL can wrap docolin with [`mcp-remote`](https://github.com/geelen/mcp-remote):

```bash
npx mcp-remote https://docolin.com/api/mcp --header "Authorization: Bearer doco_mcp_YOUR_TOKEN"
```

Point the client at that as a normal stdio command. On Windows, prefer the `"Authorization:${ENV}"` form with the value in `env`, as in the Claude Desktop tab.

## More clients

All of these support remote Streamable HTTP. Use the listed key, URL field, and header mechanism:

| Client                 | Config                        | Top-level key       | URL field                             | Header                         |
| ---------------------- | ----------------------------- | ------------------- | ------------------------------------- | ------------------------------ |
| Roo Code               | `.roo/mcp.json`               | `mcpServers`        | `url` + `type: "streamable-http"`     | `headers`                      |
| Continue               | `config.yaml`                 | `mcpServers` (list) | `url` + `type: streamable-http`       | `requestOptions.headers`       |
| opencode               | `opencode.json`               | `mcp`               | `url` + `type: "remote"`              | `headers` (set `oauth: false`) |
| LM Studio              | `mcp.json`                    | `mcpServers`        | `url`                                 | `headers`                      |
| Warp                   | `.warp/.mcp.json`             | `mcpServers`        | `url`                                 | `headers`                      |
| Amazon Q (IDE)         | `.amazonq/default.json`       | `mcpServers`        | `url` + `type: "http"`                | Headers field                  |
| Qwen Code              | `~/.qwen/settings.json`       | `mcpServers`        | `httpUrl`                             | `headers`                      |
| Zed                    | `~/.config/zed/settings.json` | `context_servers`   | `url` (unreliable; prefer the bridge) | bridge                         |
| JetBrains AI Assistant | client settings               | `mcpServers`        | `url`                                 | use the bridge                 |

Anything else that speaks MCP follows one of the shapes on this page. When in doubt, the `mcp-remote` bridge works everywhere.

## Keep your token out of the config

Most clients can read the token from an environment variable instead of hardcoding it: `${env:VAR}` (Cursor, Windsurf, Cline), `${input:...}` (VS Code), `bearer_token_env_var` (Codex), or `$VAR` inside `--header` (Claude Code, Gemini CLI). Treat the token like a password; you can revoke it any time from the [MCP dashboard](/dashboard/mcp).

## What your agent does with it

Once connected, your agent should cite the docos it uses by title, author, and URL, and close the verification loop: when a doco works (or does not) on a real system, it records that, signed to your account if you added a token, or by handing you a one-click link if you did not. That feedback is what keeps docolin's content verified, so connecting with a token and letting your agent stamp outcomes is the single best way to give back.

!!! note "Client configs drift"
    MCP clients change their config formats often. This page is verified against each vendor's docs and kept current; if a snippet stops working, the vendor's own MCP docs are the tiebreaker. Last verified: May 2026.
