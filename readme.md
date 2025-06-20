# Carbon Voice MCP Server

A Model Context Protocol (MCP) server implementation for integrating with Carbon Voice's API, providing AI assistants with comprehensive tools for voice messaging, conversations, and workspace management.

## Features

- **Message Management**: Create, list, and retrieve voice messages, conversation messages, and direct messages
- **User Operations**: Search and retrieve user information
- **Conversation Management**: Access and manage conversations and their participants
- **Folder Operations**: Create, organize, move, and manage folders and their contents
- **Workspace Administration**: Get workspace information
- **AI Actions**: Run AI prompts and retrieve AI-generated responses
- **Attachment Support**: Add link attachments to messages

## Prerequisites

### API Key Required

To use this MCP server, you need a Carbon Voice API key. Please contact the Carbon Voice development team to request your API key:

**📧 Contact**: devsupport@phononx.com

## Configuration

### For Cursor

1. Open Cursor
2. Go to **Cursor Settings** > **Features** > **Model Context Protocol**
3. Add a new MCP server configuration:

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

4. Replace `"your_api_key_here"` with your actual Carbon Voice API key
5. Save and restart Cursor

### For Claude Desktop

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

## Available Tools

### Messages

- **`list_messages`** - List messages with date filtering (max 31-day range)
- **`get_message`** - Retrieve a specific message by ID
- **`get_recent_messages`** - Get the 10 most recent messages with full context
- **`create_conversation_message`** - Send a message to a conversation
- **`create_direct_message`** - Send direct messages to users or groups
- **`create_voicememo_message`** - Create voice memo messages
- **`add_attachments_to_message`** - Add link attachments to existing messages

### Users

- **`get_user`** - Retrieve user information by ID
- **`search_user`** - Find a user by phone number or email
- **`search_users`** - Search multiple users by various identifiers

### Conversations

- **`list_conversations`** - Get all conversations from the last 6 months
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

## Development

### Building from Source

```bash
npm run build
```

### Running in Development Mode

```bash
npm run auto:build  # Watch mode with auto-rebuild
```

### Linting

```bash
npm run lint:fix
```

### Testing with MCP Inspector

```bash
npm run mcp:inspector
```

## Support

- **Issues**: [GitHub Issues](https://github.com/PhononX/cv-mcp-server/issues)
- **API Key Requests**: devsupport@phononx.com
- **Website**: [https://getcarbon.app](https://getcarbon.app)

## License

ISC License - See LICENSE file for details.

---

**Note**: This MCP server requires a valid Carbon Voice API key to function. Please ensure you have obtained your API key from the Carbon Voice team before attempting to use the server.
