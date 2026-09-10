# Carbon Voice MCP Server

[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io) [![npm version](https://badge.fury.io/js/%40carbonvoice%2Fcv-mcp-server.svg)](https://www.npmjs.com/package/@carbonvoice/cv-mcp-server)

A Model Context Protocol (MCP) server implementation for integrating with [Carbon Voice's API](https://api.carbonvoice.app/docs), providing AI assistants with comprehensive tools for voice messaging, conversations, and workspace management.

**<img src="https://carbonvoice.app/favicon.ico" alt="Carbon Voice Logo" width="32" height="32" align="center" style="margin-right: 10px;">Carbon Voice**: [https://getcarbon.app](https://getcarbon.app)

**<img src="https://pxassets.s3.us-east-2.amazonaws.com/images/swagger-logo.png" alt="Carbon Voice API Logo" width="32" height="32" align="center" style="margin-right: 10px;">API**: [https://api.carbonvoice.app/docs](https://api.carbonvoice.app/docs)

## Features

- **Message Management**: Create, list, and retrieve voice messages, conversation messages, and direct messages
- **User Operations**: Search and retrieve user information
- **Conversation Management**: Access and manage conversations and their participants
- **Folder Operations**: Create, organize, move, and manage folders and their contents
- **Workspace Administration**: Get workspace information
- **AI Actions**: Run AI prompts and retrieve AI-generated responses
- **Attachment Support**: Add link attachments to messages

## Security & Compliance

This server fully complies with [MCP Security Best Practices](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices):

- **OAuth 2.1 Authentication**: Secure authorization flow with proper token handling
- **HTTPS Enforcement**: All remote endpoints served over HTTPS
- **Session Security**: Cryptographically secure session management
- **Input Validation**: Comprehensive validation of all user inputs
- **Rate Limiting**: Built-in protection against abuse

For security concerns, please contact: devsupport@phononx.com

## Prerequisites

### For Stdio Transport (Local Installation)

**Required:**

1. **Carbon Voice API Key** - Contact the Carbon Voice development team to request your API key:

   - **📧 Contact**: devsupport@phononx.com
   - **📧 Subject**: "Request API key for MCP Server"

2. **npx Installation** - You must have `npx` installed on your system. npx comes bundled with Node.js (version 14.8.0 or later). If you don't have Node.js installed, you can download it from [nodejs.org](https://nodejs.org/).

   To verify your installation, run:

   ```bash
   npx --version
   ```

### For HTTP Transport (Remote)

**Required:**

1. **Nothing!** - No additional prerequisites are required. The HTTP transport version runs entirely in the cloud and uses OAuth2 authentication, so you don't need an API key or npx installed.

## Configuration

### Quick Overview

| Client             | HTTP Transport (Remote) | Stdio Transport (Local) |
| ------------------ | ----------------------- | ----------------------- |
| **Cursor**         | ✅ Recommended          | ✅ Available            |
| **Claude Desktop** | ✅ Recommended          | ✅ Available            |

_HTTP Transport is recommended for easier setup and enhanced security._

### For Cursor

#### HTTP Transport (Remote)

1. Open Cursor
2. Go to **Cursor Settings** > **Features** > **Model Context Protocol**
3. Add a new MCP server configuration:

```json
{
  "mcpServers": {
    "Carbon Voice": {
      "url": "https://mcp.carbonvoice.app"
    }
  }
}
```

4. Save and restart Cursor

The first time you use it, Cursor will guide you through the OAuth2 authentication process.

#### Stdio Transport (Local Installation)

If you prefer to run the MCP server locally with API key authentication:

1. Open Cursor
2. Go to **Cursor Settings** > **Features** > **Model Context Protocol**
3. Add a new MCP server configuration:

```json
{
  "mcpServers": {
    "Carbon Voice": {
      "command": "npx",
      "env": {
        "CARBON_VOICE_API_KEY": "your_api_key_here"
      },
      "args": ["-y", "@carbonvoice/cv-mcp-server"]
    }
  }
}
```

4. Replace `"your_api_key_here"` with your actual Carbon Voice API key
5. Save and restart Cursor

### For Claude Desktop

#### HTTP Transport (Remote)

Setting up Carbon Voice in Claude Desktop is straightforward! Here's how to do it:

1. **Open Claude Desktop** and navigate to **Search and Tools**

2. **Go to Manage Connectors** and click **"Add custom connector"**

3. **Fill in the connector details**:

   - **Name**: Give it a friendly name like "Carbon Voice"
   - **Remote MCP Server URL**: Enter `https://mcp.carbonvoice.app`

4. **Save your connector**

5. **Click Connect**:

The first time you use it, Claude will guide you through the OAuth2 authentication process. You'll just need to sign in with your Carbon Voice account and grant permissions. After that, you're all set!

#### Stdio Transport (Local Installation)

If you prefer to run the MCP server locally with API key authentication:

1. Open your Claude Desktop configuration file:

   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the Carbon Voice MCP server configuration:

```json
{
  "mcpServers": {
    "Carbon-Voice": {
      "command": "npx",
      "env": {
        "CARBON_VOICE_API_KEY": "your_api_key_here"
      },
      "args": ["-y", "@carbonvoice/cv-mcp-server"]
    }
  }
}
```

3. Replace `"your_api_key_here"` with your actual Carbon Voice API key
4. Save the file and restart Claude Desktop

### Environment Variables (Only available for Stdio Version)

When using the stdio version of the MCP server, you can configure additional environment variables:

#### AUDIO_FETCH_ALLOWED_HOSTS

Comma-separated hostname allowlist for `create_voicememo_message`'s `audio_url`.
When set, only these hosts (and their subdomains) may be fetched. **Set this in
production** — it is the strongest control against the server being used as an
SSRF proxy. When unset, any public host is allowed, but private, loopback and
link-local address space is still refused.

```
AUDIO_FETCH_ALLOWED_HOSTS=cdn.example.com,uploads.example.com
```

#### AUDIO_FETCH_MAX_BYTES

Maximum size of a fetched audio file, in bytes. Defaults to `26214400` (25 MB).
Enforced against both `content-length` and the bytes actually received.

#### AUDIO_FETCH_TIMEOUT_MS

Timeout for the whole `audio_url` fetch, in milliseconds. Defaults to `30000`.

#### LOG_LEVEL

Controls the verbosity of logging output. Available options:

- `info` (default) - Standard logging information
- `debug` - Most verbose logging, shows detailed request/response data
- `warn` - Only warning and error messages
- `error` - Only error messages

**Example:**

```json
{
  "mcpServers": {
    "Carbon-Voice": {
      "command": "npx",
      "env": {
        "CARBON_VOICE_API_KEY": "your_api_key_here",
        "LOG_LEVEL": "debug"
      },
      "args": ["-y", "@carbonvoice/cv-mcp-server"]
    }
  }
}
```

#### LOG_DIR

Specifies the directory where log files will be stored. Defaults to: `/tmp/cv-mcp-server/logs`

The server will create two log files in this directory:

- `combined.log` - Contains all log messages
- `error.log` - Contains only error messages

**Example:**

```json
{
  "mcpServers": {
    "Carbon-Voice": {
      "command": "npx",
      "env": {
        "CARBON_VOICE_API_KEY": "your_api_key_here",
        "LOG_DIR": "/Users/USER_NAME/Documents/cv-mcp-server/logs"
      },
      "args": ["-y", "@carbonvoice/cv-mcp-server"]
    }
  }
}
```

**Complete Example with Both Variables:**

```json
{
  "mcpServers": {
    "Carbon-Voice": {
      "command": "npx",
      "env": {
        "CARBON_VOICE_API_KEY": "your_api_key_here",
        "LOG_LEVEL": "debug",
        "LOG_DIR": "/Users/USER_NAME/Documents/cv-mcp-server/logs"
      },
      "args": ["-y", "@carbonvoice/cv-mcp-server"]
    }
  }
}
```

## Available Tools

### Messages

- **`list_messages`** - List messages with date filtering (max 31-day range)
- **`get_message`** - Retrieve a specific message by ID
- **`get_recent_messages`** - Get the 10 most recent messages with full context
- **`create_conversation_message`** - Send a message to a conversation
- **`create_direct_message`** - Send direct messages to users or groups
- **`create_voicememo_message`** - Create a voice memo from text (spoken via TTS) or from audio at a URL
- **`add_attachments_to_message`** - Add link attachments to existing messages

> **Voice memo audio.** Pass `audio_url` (a public http(s) URL) to upload existing
> audio; the server fetches it and forwards the bytes. The upstream `audio_file`
> multipart param is not exposed over MCP, because a JSON-RPC client cannot
> construct a `File`. Fetches are constrained: http(s) only, private/loopback/
> link-local addresses refused, redirects re-validated per hop, plus a size cap
> and timeout — see `AUDIO_FETCH_*` below.

### Users

- **`get_user`** - Retrieve user information by ID
- **`search_user`** - Find a user by phone number or email
- **`search_users`** - Search multiple users by various identifiers

### Conversations

- **`list_conversations`** - Get all conversations from the last 6 months, with optional filtering by user IDs
- **`get_conversation`** - Retrieve conversation details by ID
- **`get_conversation_users`** - Get all users in a conversation

### Folders

- **`get_workspace_folders_and_message_counts`** - Get folder and message statistics
- **`get_root_folders`** - List root folders for a workspace
- **`create_folder`** - Create new folders
- **`get_folder`** - Retrieve folder information
- **`get_folder_with_messages`** - Get folder with its messages
- **`update_folder_name`** - Rename folders
- **`delete_folder`** - Delete folders (⚠️ destructive operation)
- **`move_folder`** - Move folders between locations
- **`move_message_to_folder`** - Organize messages into folders

### Workspace

- **`get_workspaces_basic_info`** - Get basic workspace information

### AI Actions

- **`list_ai_actions`** - List available AI prompts/actions
- **`run_ai_action`** - Execute AI actions on messages
- **`run_ai_action_for_shared_link`** - Run AI actions on shared content
- **`get_ai_action_responses`** - Retrieve AI-generated responses

### Search & Notifications

- **`search_message_ids`** - Find message IDs by notified state, mentions, labels, creator, conversation, or workspace (cursor-paginated, IDs only)
- **`search_messages_by_heard_status`** - Find unheard/heard messages, with per-conversation unheard counts
- **`list_inbox_notifications`** - List inbox notifications (including the `mentions` category) with a total unread count

> These three call the full Carbon Voice API rather than the simplified surface,
> since notified state, listened state, and notification records have no
> simplified-API equivalent.

### Action Items

- **`list_my_action_items`** - List action items assigned to you across all conversations
- **`list_action_items`** - List action items in one conversation, folder, or home
- **`get_action_item`** - Get a single action item by ID
- **`create_action_item`** - Create an action item
- **`update_action_item`** - Update title, notes, assignee, or due date
- **`set_action_item_status`** - Move an item between `suggested`, `todo`, and `done`
- **`delete_action_item`** - Permanently delete an action item
- **`suggest_action_items_from_messages`** - Extract candidate action items from messages using AI

### Message Share Links

- **`create_message_share_link`** - Create a shareable link to a message (returns the URL)
- **`get_message_share_link`** - Look up an existing share link, including its access settings

## Narrowing Responses (`response_fields`)

Most read tools accept an optional `response_fields` array — a dot-path allowlist
that shrinks the response before it reaches the agent's context. Paths traverse
arrays element-wise, and pagination fields (`total`, `has_next_page`, `has_more`,
`next_cursor`, …) are always kept so the "is there more?" signal survives.

```json
{ "response_fields": ["total", "has_next_page", "results.id", "results.transcript"] }
```

Omitting it returns the full payload unchanged, so existing integrations are
unaffected. Measured on recorded fixtures (`npm run measure:payloads`):

| Tool | Full | Narrowed |
| --- | --- | --- |
| `get_current_user` | 8,447 bytes | 2,050 bytes (75.7% smaller) |
| `list_messages` (20 results) | 21,947 bytes | 4,629 bytes (78.9% smaller) |

Each tool's description suggests a sensible starting set for the common case.

## Usage Examples

### Getting Started

After configuration, you can interact with Carbon Voice through your AI assistant. Here are some example requests:

```
"Show me my recent messages"
"Create a voice memo about today's meeting"
"Search for user john@example.com"
"Show me my workspace information"
"List my conversations from this week"
```

### Working with Folders

```
"Create a folder called 'Project Updates'"
"Move message ID 12345 to the Project Updates folder"
"Show me all messages in the Marketing folder"
```

### AI Actions

```
"Run a summary AI action on message ID 67890"
"List all available AI prompts"
"Get AI responses for conversation ID 123"
```

## Error Handling

The server includes comprehensive error handling and logging. Errors are returned in a structured format that includes:

- Error messages
- HTTP status codes
- Request context
- Debugging information

## Local Testing

```bash
cp .env.sample .env      # CARBON_VOICE_API_KEY only needed for real tool calls
npm run build
```

### Pointing a real client at your local build

To use your branch in Claude Desktop / Cursor / Claude Code instead of the
published package, build it and point the client at the built entrypoint by
absolute path.

```bash
npm run build          # produces dist/transports/stdio/stdio.js
pwd                    # note the absolute path
```

**Claude Code (CLI)** — easiest, and scoped to one project:

```bash
claude mcp add carbon-voice-dev \
  --env CARBON_VOICE_API_KEY=your_key_here \
  -- node /absolute/path/to/cv-mcp-server/dist/transports/stdio/stdio.js
```

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).
**Cursor** — Settings → Features → Model Context Protocol. Same JSON:

```json
{
  "mcpServers": {
    "carbon-voice-dev": {
      "command": "node",
      "args": ["/absolute/path/to/cv-mcp-server/dist/transports/stdio/stdio.js"],
      "env": {
        "CARBON_VOICE_API_KEY": "your_key_here"
      }
    }
  }
}
```

Restart the client after editing. Name it `carbon-voice-dev` so it can sit
alongside the published `Carbon Voice` entry and you can compare the two.

> **The `env` block is mandatory — `.env` is NOT read here.** `env-cmd` only
> wraps the npm scripts, and `scripts/mcp-client.mjs` parses `.env` itself; the
> server reads plain `process.env`. An MCP client spawns the process with a
> minimal environment, so a key that only exists in `.env` will not be seen.

> **A missing key looks like success.** `CARBON_VOICE_API_KEY` is optional in
> the config schema and `tools/list` never calls the API, so the server
> connects and shows all 41 tools with no key at all. The failure surfaces
> only on the first tool call. "It connected" does not mean auth works — make
> a real call to confirm.

After any code change: `npm run build`, then restart the client. Clients cache
the tool list per connection, so a reconnect is what picks up new or renamed
tools.

**Debugging.** Logs default to the `file` transport at
`/tmp/cv-mcp-server/logs/` (`combined.log`, `error.log`) — the place to look
when a client reports a server that won't start:

```bash
tail -f /tmp/cv-mcp-server/logs/combined.log
```

Add `"LOG_LEVEL": "debug"` to the `env` block for request/response tracing.
Logs go to stderr and files, never stdout, so they cannot corrupt the JSON-RPC
stream.

### Driving the server from the terminal

`scripts/mcp-client.mjs` is a minimal stdio MCP client — the MCP Inspector is a
browser UI, which is no help in a terminal or CI.

```bash
npm run mcp:list                     # every tool with its wire cost
npm run mcp:schema -- get_message    # description + input JSON Schema an agent sees
npm run mcp:size                     # tools/list payload budget
npm run mcp:call -- get_current_user '{"response_fields":["user.user_guid"]}'
```

`MCP_DEBUG=1` shows server logs (they go to stderr, so they never corrupt the
JSON-RPC stream on stdout).

**`list`, `schema` and `size` need no credentials** — the server builds its tool
list without calling out. So do any calls rejected by local validation, which is
a useful way to exercise error paths:

```bash
npm run mcp:call -- create_voicememo_message '{"audio_url":"http://169.254.169.254/"}'
# -> isError: true, INVALID_AUDIO_URL, with a next_action hint
```

Calls that reach the API need a valid `CARBON_VOICE_API_KEY`.

### MCP Inspector

```bash
npm run mcp:inspector:stdio          # browser UI against the stdio server
npm run dev:http                     # then: npm run mcp:inspector:http
```

### HTTP transport

```bash
npm run dev:http                     # stateful (what production runs)
npm run dev:http:stateless           # fresh server per request
```

Unauthenticated endpoints for a quick check:

```bash
curl localhost:3005/health           # includes upstream API reachability
curl localhost:3005/info
curl localhost:3005/.well-known/oauth-protected-resource
```

`POST /` (the MCP endpoint) requires a bearer token — it returns **401** without
one, so tool calls over HTTP can't be exercised locally without a real OAuth
token. Use the stdio path for tool-level work.

### Tests

```bash
npm run test:unit                    # fast, no network
npm run test:e2e                     # HTTP transport
npm run test:coverage
npm run measure:payloads             # response projection + tools/list budget
```

## Development

This section is for developers who want to contribute, implement new features, or fix issues.

### Development Commands

#### Building and Development

```bash
npm run build          # Build the project
npm run auto:build     # Watch mode with auto-rebuild (recommended for development)
npm run lint:fix       # Fix linting issues
```

#### API Generation

```bash
npm run generate:api   # Generate TypeScript types from Carbon Voice API
```

#### Running the Server

```bash
npm run dev:http       # Start HTTP server in development mode with hot reload
npm run start:http     # Start HTTP server in production mode
```

#### Testing with MCP Inspector

**Setup**: Copy `.env.sample` to `.env` and configure your development environment variables.

```bash
npm run mcp:inspector:stdio  # Test stdio transport with MCP Inspector
npm run mcp:inspector:http   # Test HTTP transport with MCP Inspector
```

**For stdio transport testing:**

1. Open the generated URL with token (e.g., `http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=46bfbd8938955be26da7f2089a8cccb7be57ed570e65d8d2d68e95561ed9b79e`)
2. Set **Transport Type**: `STDIO`
3. Set **Command**: `node`
4. Click **Connect**
5. Should see Connected info.

**For HTTP transport testing:**

1. Open the generated URL with token
2. Set **Transport Type**: `Streamable HTTP`
3. Set **URL**: `http://localhost:3005`
4. Click Auth, then Quick Oauth Flow.
5. Will be redirected to Carbon Voice Auth Page. After Login, Bearer token should be auto added to Authorization Request headers.
6. Click **Connect**
7. Should see Connected info.

### Version Management

**Note**: Only code merged to main branch with a **different version** from the current one will create a new Git tag and trigger a new npm package release. The CI/CD pipeline automatically checks if the version in `package.json` has changed before deploying and publishing.

#### Version Commands

```bash
npm run version:patch  # Bump patch version (1.0.0 → 1.0.1)
npm run version:minor  # Bump minor version (1.0.0 → 1.1.0)
npm run version:major  # Bump major version (1.0.0 → 2.0.0)
```

#### Release Commands

```bash
npm run release:patch  # Build, test, version patch, and merge to main
npm run release:minor  # Build, test, version minor, and merge to main
npm run release:major  # Build, test, version major, and merge to main
npm run deploy:release # Build, test, and merge to main (no version bump)
```

### Development Workflow Examples

#### Commit to Develop

```bash
# 1. Make your changes and test locally
npm run build
npm run lint:fix

# 2. Commit and push to develop
git add .
git commit -m "feat: add new message filtering feature"
git push origin develop
```

#### Release Bug Fix

```bash
# 1. Test your changes
npm run build
npm run mcp:inspector:http

# 2. Release patch version
npm run release:patch
```

#### Release New Feature

```bash
# 1. Test your changes
npm run build
npm run mcp:inspector:stdio
npm run mcp:inspector:http

# 2. Release minor version
npm run release:minor
```

### Development Tips

- **Use `auto:build`** during development for automatic rebuilding when files change
- **Test both transports** with MCP Inspector before releasing
- **Run `generate:api`** when Carbon Voice API changes
- **Use semantic versioning**: patch for fixes, minor for features, major for breaking changes
- **Always test** with both stdio and HTTP transports before releasing

## MCP Compliance

This server is fully compliant with the [Model Context Protocol specification](https://modelcontextprotocol.io) and follows all security best practices outlined in the official documentation. The implementation supports both stdio and HTTP transports as defined in the MCP specification.

## Support

- **Issues**: [GitHub Issues](https://github.com/PhononX/cv-mcp-server/issues)
- **API Key Requests**: devsupport@phononx.com
- **Carbon Voice Platform**: [https://getcarbon.app](https://getcarbon.app)
- **API Documentation**: [https://api.carbonvoice.app/docs](https://api.carbonvoice.app/docs)

## License

ISC License - See [LICENSE](LICENSE) file for details.

---

**Note**: This MCP server requires a valid Carbon Voice API key to function with stdio transport. For HTTP transport, OAuth2 authentication is handled automatically through the web interface. Please ensure you have the appropriate credentials before attempting to use the server.
