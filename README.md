# OpenAPI to MCP Server

A tool that creates MCP (Model Context Protocol) servers from OpenAPI/Swagger specifications, enabling AI assistants to interact with your APIs. **Create your own [branded and customized MCPs](#customizing-and-publishing-your-own-version)** for specific APIs or services.

## Overview

This project creates a dynamic MCP server that transforms OpenAPI specifications into MCP tools. It enables seamless integration of REST APIs with AI assistants via the Model Context Protocol, turning any API into an AI-accessible tool.

## Features

- Dynamic loading of OpenAPI specs from file or HTTP/HTTPS URLs
- Support for [OpenAPI Overlays](#openapi-overlays) loaded from files or HTTP/HTTPS URLs
- Customizable mapping of OpenAPI operations to MCP tools
- Advanced filtering of operations using glob patterns for both operationId and URL paths
- Comprehensive parameter handling with format preservation and location metadata
- API authentication handling
- OpenAPI metadata (title, version, description) used to configure the MCP server
- Hierarchical description fallbacks (operation description → operation summary → path summary)
- Custom HTTP headers support via environment variables and CLI
- X-MCP header for API request tracking and identification
- Support for custom `x-mcp` extensions at the path level to override tool names and descriptions

## Using with AI Assistants

This tool creates an MCP server that allows AI assistants to interact with APIs defined by OpenAPI specifications. The primary way to use it is by configuring your AI assistant to run it directly as an MCP tool.

### Setting Up in Claude Desktop

1. Ensure you have [Node.js](https://nodejs.org/) installed on your computer
2. Open Claude Desktop and navigate to Settings > Developer
3. Edit the configuration file (or it will be created if it doesn't exist):
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

4. Add this configuration (customize as needed):

```json
{
  "mcpServers": {
    "api-tools": {
      "command": "npx",
      "args": [
        "-y",
        "@tyk-technologies/api-to-mcp@latest",
        "--spec",
        "https://petstore3.swagger.io/api/v3/openapi.json"
      ],
      "enabled": true
    }
  }
}
```

5. Restart Claude Desktop
6. You should now see a hammer icon in the chat input box. Click it to access your API tools.

### Customizing the Configuration

You can adjust the `args` array to customize your MCP server with various options:

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": [
        "-y",
        "@tyk-technologies/api-to-mcp@latest",
        "--spec",
        "./path/to/your/openapi.json",
        "--overlays",
        "./path/to/overlay.json,https://example.com/api/overlay.json",
        "--whitelist",
        "getPet*,POST:/users/*",
        "--targetUrl",
        "https://api.example.com"
      ],
      "enabled": true
    }
  }
}
```

### Setting Up in Cursor

1. Create a configuration file in one of these locations:
   - Project-specific: `.cursor/mcp.json` in your project directory
   - Global: `~/.cursor/mcp.json` in your home directory

2. Add this configuration (adjust as needed for your API):

```json
{
  "servers": [
    {
      "command": "npx",
      "args": [
        "-y",
        "@tyk-technologies/api-to-mcp@latest",
        "--spec",
        "./path/to/your/openapi.json"
      ],
      "name": "My API Tools"
    }
  ]
}
```

3. Restart Cursor or reload the window

### Using with Vercel AI SDK

You can also use this MCP server directly in your JavaScript/TypeScript applications using the Vercel AI SDK's MCP client:

```javascript
import { experimental_createMCPClient } from 'ai';
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Initialize the Google Generative AI provider
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY, // Set your API key in environment variables
});
const model = google('gemini-2.0-flash');

// Create an MCP client with stdio transport
const mcpClient = await experimental_createMCPClient({
  transport: {
    type: 'stdio',
    command: 'npx', // Command to run the MCP server
    args: ['-y', '@tyk-technologies/api-to-mcp', '--spec', 'https://petstore3.swagger.io/api/v3/openapi.json'], // OpenAPI spec
    env: {
      // You can set environment variables here
      // API_KEY: process.env.YOUR_API_KEY,
    },
  },
});

async function main() {
  try {
    // Retrieve tools from the MCP server
    const tools = await mcpClient.tools();

    // Generate text using the AI SDK with MCP tools
    const { text } = await generateText({
      model,
      prompt: 'List all available pets in the pet store using the API.',
      tools, // Pass the MCP tools to the model
    });

    console.log('Generated text:', text);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Always close the MCP client to release resources
    await mcpClient.close();
  }
}

main();
```

## Configuration

Configuration is managed via environment variables, command-line options, or a JSON configuration file:

### Command Line Options

```bash
# Start with specific OpenAPI spec file
@tyk-technologies/api-to-mcp --spec=./path/to/openapi.json

# Apply overlays to the spec
@tyk-technologies/api-to-mcp --spec=./path/to/openapi.json --overlays=./path/to/overlay.json,https://example.com/api/overlay.json

# Include only specific operations (supports glob patterns)
@tyk-technologies/api-to-mcp --spec=./path/to/openapi.json --whitelist="getPet*,POST:/users/*"

# Specify target API URL
@tyk-technologies/api-to-mcp --spec=./path/to/openapi.json --targetUrl=https://api.example.com

# Add custom headers to all API requests
@tyk-technologies/api-to-mcp --spec=./path/to/openapi.json --headers='{"X-Api-Version":"1.0.0"}'

# Disable the X-MCP header
@tyk-technologies/api-to-mcp --spec=./path/to/openapi.json --disableXMcp
```

### Environment Variables

You can set these in a `.env` file or directly in your environment:

- `OPENAPI_SPEC_PATH`: Path to OpenAPI spec file
- `OPENAPI_OVERLAY_PATHS`: Comma-separated paths to overlay JSON files
- `TARGET_API_BASE_URL`: Base URL for API calls (overrides OpenAPI servers)
- `MCP_WHITELIST_OPERATIONS`: Comma-separated list of operation IDs or URL paths to include (supports glob patterns like `getPet*` or `GET:/pets/*`)
- `MCP_BLACKLIST_OPERATIONS`: Comma-separated list of operation IDs or URL paths to exclude (supports glob patterns, ignored if whitelist used)
- `API_KEY`: API Key for the target API (if required)
- `SECURITY_SCHEME_NAME`: Name of the security scheme requiring the API Key
- `SECURITY_CREDENTIALS`: JSON string containing security credentials for multiple schemes
- `CUSTOM_HEADERS`: JSON string containing custom headers to include in all API requests
- `HEADER_*`: Any environment variable starting with `HEADER_` will be added as a custom header (e.g., `HEADER_X_API_Version=1.0.0` adds the header `X-API-Version: 1.0.0`)
- `DISABLE_X_MCP`: Set to `true` to disable adding the `X-MCP: 1` header to all API requests
- `CONFIG_FILE`: Path to a JSON configuration file

### JSON Configuration

You can also use a JSON configuration file instead of environment variables or command-line options. The MCP server will look for configuration files in the following order:

1. Path specified by `--config` command-line option
2. Path specified by `CONFIG_FILE` environment variable
3. `config.json` in the current directory
4. `openapi-mcp.json` in the current directory
5. `.openapi-mcp.json` in the current directory

Example JSON configuration file:

```json
{
  "spec": "./path/to/openapi-spec.json",
  "overlays": "./path/to/overlay1.json,https://example.com/api/overlay.json",
  "targetUrl": "https://api.example.com",
  "whitelist": "getPets,createPet,/pets/*",
  "blacklist": "deletePet,/admin/*",
  "apiKey": "your-api-key",
  "securitySchemeName": "ApiKeyAuth",
  "securityCredentials": {
    "ApiKeyAuth": "your-api-key",
    "OAuth2": "your-oauth-token"
  },
  "headers": {
    "X-Custom-Header": "custom-value",
    "User-Agent": "OpenAPI-MCP-Client/1.0"
  },
  "disableXMcp": false
}
```

A full example configuration file with explanatory comments is available at `config.example.json` in the root directory.

### Configuration Precedence

Configuration settings are applied in the following order of precedence (highest to lowest):

1. Command-line options
2. Environment variables
3. JSON configuration file

## Development

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd openapi-to-mcp-generator

# Install dependencies
npm install

# Build the project
npm run build
```

### Local Testing

```bash
# Start the MCP server
npm start

# Development mode with auto-reload
npm run dev
```

### Customizing and Publishing Your Own Version

You can use this repository as a base for creating your own customized OpenAPI to MCP server. This section explains how to fork the repository, customize it for your specific APIs, and publish it as a package.

#### Forking and Customizing

1. **Fork the Repository**:
   Fork this repository on GitHub to create your own copy that you can customize.

2. **Add Your OpenAPI Specs**:
   ```bash
   # Create a specs directory if it doesn't exist
   mkdir -p specs
   
   # Add your OpenAPI specifications
   cp path/to/your/openapi-spec.json specs/
   
   # Add any overlay files
   cp path/to/your/overlay.json specs/
   ```

3. **Configure Default Settings**:
   Create a custom config file that will be bundled with your package:
   ```bash
   # Copy the example config
   cp config.example.json config.json
   
   # Edit the config to point to your bundled specs
   # and set any default settings
   ```

4. **Update package.json**:
   ```json
   {
     "name": "your-custom-mcp-server",
     "version": "1.0.0",
     "description": "Your customized MCP server for specific APIs",
     "files": [
       "dist/**/*",
       "config.json",
       "specs/**/*",
       "README.md"
     ]
   }
   ```

5. **Ensure Specs are Bundled**:
   The `files` field in package.json (shown above) ensures your specs and config file will be included in the published package.

#### Customizing the GitHub Workflow

The repository includes a GitHub Actions workflow for automatic publishing to npm. To customize it for your forked repo:

1. **Update the Workflow Name**:
   Edit `.github/workflows/publish-npm.yaml` to update the name if desired:
   ```yaml
   name: Publish My Custom MCP Package
   ```

2. **Set Package Scope (if needed)**:
   If you want to publish under an npm organization scope, uncomment and modify the scope line in the workflow file:
   ```yaml
   - name: Setup Node.js
     uses: actions/setup-node@v4
     with:
       node-version: "18"
       registry-url: "https://registry.npmjs.org/"
       # Uncomment and update with your organization scope:
       scope: "@your-org"
   ```

3. **Set Up npm Token**:
   Add your npm token as a GitHub secret named `NPM_TOKEN` in your forked repository's settings.

#### Publishing Your Customized Package

Once you've customized the repository:

1. **Create and Push a Tag**:
   ```bash
   # Update version in package.json (optional, the workflow will update it based on the tag)
   npm version 1.0.0
   
   # Push the tag
   git push --tags
   ```

2. **GitHub Actions will**:
   - Automatically build the package
   - Update version in package.json to match the tag
   - Publish to npm with your bundled specs and config

## Usage After Publication

Users of your customized package can install and use it with npm:

```bash
# Install your customized package
npm install your-custom-mcp-server -g

# Run it
your-custom-mcp-server
```

They can override your default settings via environment variables or command line options as described in the Configuration section.

## License

MIT
