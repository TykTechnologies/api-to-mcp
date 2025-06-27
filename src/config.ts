import dotenv from 'dotenv';
import path from 'path';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import { isHttpUrl } from './utils/httpClient';

dotenv.config();

// Process command-line arguments first - before any code that uses argv
const argv = yargs(hideBin(process.argv))
    .option('config', {
        alias: 'c',
        type: 'string',
        description: 'Path to JSON configuration file'
    })
    .option('spec', {
        alias: 's',
        type: 'string',
        description: 'Path to the OpenAPI specification file'
    })
    .option('overlays', {
        alias: 'o',
        type: 'string', // Comma-separated paths
        description: 'Comma-separated paths to OpenAPI overlay files'
    })
    .option('port', {
        alias: 'p',
        type: 'number',
        description: 'Port for the MCP server'
    })
    .option('targetUrl', {
        alias: 'u',
        type: 'string',
        description: 'Target API base URL (overrides OpenAPI servers)'
    })
    .option('whitelist', {
        alias: 'w',
        type: 'string',
        description: 'Comma-separated operationIds or URL paths to include (supports glob patterns)'
    })
    .option('blacklist', {
        alias: 'b',
        type: 'string',
        description: 'Comma-separated operationIds or URL paths to exclude (supports glob patterns, ignored if whitelist used)'
    })
    // Add options for credentials as needed
    .option('apiKey', {
        type: 'string',
        description: 'API Key for the target API'
    })
    .option('securitySchemeName', {
        type: 'string',
        description: 'Name of the security scheme requiring the API Key'
    })
    .option('securityCredentials', {
        type: 'string',
        description: 'JSON string containing security credentials for multiple schemes'
    })
    .option('headers', {
        type: 'string',
        description: 'JSON string containing custom headers to include in all API requests'
    })
    .option('disableXMcp', {
        type: 'boolean',
        description: 'Disable adding X-MCP: 1 header to all API requests'
    })
    .help()
    .parseSync(); // Use parseSync or handle async parsing

// Parse custom headers from environment variables
const customHeadersFromEnv: Record<string, string> = {};
Object.keys(process.env).forEach(key => {
    if (key.startsWith('HEADER_')) {
        const headerName = key.substring(7); // Remove 'HEADER_' prefix
        customHeadersFromEnv[headerName] = process.env[key] || '';
    }
});

// Function to load JSON configuration file
function loadJsonConfig(configPath: string): Record<string, any> {
    try {
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf8');
            const jsonConfig = JSON.parse(configContent);
            console.error(`Loaded configuration from ${configPath}`);
            return jsonConfig;
        }
    } catch (error) {
        console.error(`Error loading JSON config from ${configPath}:`, error);
    }
    return {};
}

// Get the package directory when running via npx
function getPackageDirectory(): string | null {
    try {
        // When running via npx, __dirname will point to the package's bin directory
        // We need to go up to the package root (from dist/src/ to package root)
        const mainModulePath = require.main?.filename || '';
        
        // For a typical package structure, we need to go up several levels
        // From <package>/dist/src/server.js to <package>
        let packageDir = path.dirname(mainModulePath);
        
        // Go up to package root (typically 2 levels)
        if (packageDir.includes('dist/src')) {
            packageDir = path.resolve(packageDir, '../..');
        } else if (packageDir.includes('dist')) {
            packageDir = path.resolve(packageDir, '..');
        }
        
        // Verify this looks like a package directory by checking for package.json
        if (fs.existsSync(path.join(packageDir, 'package.json'))) {
            return packageDir;
        }
    } catch (error) {
        console.error('Error determining package directory:', error);
    }
    return null;
}

// Get config paths to check
function getConfigPaths(): string[] {
    // Check if running as a package (via npx)
    const packageDir = getPackageDirectory();
    if (packageDir) {
        const packageConfigPath = path.join(packageDir, 'config.json');
        console.error(`Checking for package config at: ${packageConfigPath}`);
        return [packageConfigPath];
    } else {
        // Fallback to current working directory if not running as a package
        return [
            path.resolve(process.cwd(), 'config.json'),
            path.resolve(process.cwd(), 'openapi-mcp.json'),
            path.resolve(process.cwd(), '.openapi-mcp.json')
        ];
    }
}

// Load configuration with proper priority handling for --config flag
let jsonConfig: Record<string, any> = {};

// First check if config is specified via CLI option
if (argv.config) {
    const configPath = path.resolve(process.cwd(), argv.config);
    jsonConfig = loadJsonConfig(configPath);
} 
// Then check environment variable
else if (process.env.CONFIG_FILE) {
    jsonConfig = loadJsonConfig(process.env.CONFIG_FILE);
} 
// Finally fall back to default paths
else {
    const configPaths = getConfigPaths();
    for (const configPath of configPaths) {
        const config = loadJsonConfig(configPath);
        if (Object.keys(config).length > 0) {
            jsonConfig = config;
            break;
        }
    }
}


// Apply priority order: CLI arguments > Environment variables > Config file
const getValueWithPriority = <T>(cliValue: T | undefined, envValue: T | undefined, configValue: T | undefined, defaultValue: T): T => {
    if (cliValue !== undefined) return cliValue;
    if (envValue !== undefined) return envValue;
    if (configValue !== undefined) return configValue;
    return defaultValue;
};

// Parse environment variables
const envValues = {
    specPath: process.env.OPENAPI_SPEC_PATH,
    overlays: process.env.OPENAPI_OVERLAY_PATHS,
    port: process.env.MCP_SERVER_PORT ? parseInt(process.env.MCP_SERVER_PORT, 10) : undefined,
    targetUrl: process.env.TARGET_API_BASE_URL,
    whitelist: process.env.MCP_WHITELIST_OPERATIONS,
    blacklist: process.env.MCP_BLACKLIST_OPERATIONS,
    apiKey: process.env.API_KEY,
    securitySchemeName: process.env.SECURITY_SCHEME_NAME,
    securityCredentials: process.env.SECURITY_CREDENTIALS,
    headers: process.env.CUSTOM_HEADERS,
    disableXMcp: process.env.DISABLE_X_MCP === 'true'
};

// Apply priority to key configuration values
const specPath = getValueWithPriority(argv.spec, envValues.specPath, jsonConfig.spec, '');
const overlays = getValueWithPriority(argv.overlays, envValues.overlays, jsonConfig.overlays, '');
const port = getValueWithPriority(argv.port, envValues.port, jsonConfig.port, 8080);
const targetUrl = getValueWithPriority(argv.targetUrl, envValues.targetUrl, jsonConfig.targetUrl, '');
const whitelist = getValueWithPriority(argv.whitelist, envValues.whitelist, jsonConfig.whitelist, '');
const blacklist = getValueWithPriority(argv.blacklist, envValues.blacklist, jsonConfig.blacklist, '');
const apiKey = getValueWithPriority(argv.apiKey, envValues.apiKey, jsonConfig.apiKey, '');
const securitySchemeName = getValueWithPriority(
    argv.securitySchemeName, 
    envValues.securitySchemeName, 
    jsonConfig.securitySchemeName, 
    ''
);

if (!specPath) {
    console.error("Error: OpenAPI specification path is required. Set OPENAPI_SPEC_PATH environment variable, use --spec option, or specify in config file.");
    process.exit(1);
}

// Parse security credentials if present
let securityCredentials: Record<string, string> = {};

// CLI has highest priority
if (argv.securityCredentials) {
    try {
        securityCredentials = JSON.parse(argv.securityCredentials);
    } catch (e) {
        console.error('Failed to parse security credentials JSON from CLI:', e);
    }
} else if (envValues.securityCredentials) {
    // Then environment variables
    try {
        securityCredentials = JSON.parse(envValues.securityCredentials);
    } catch (e) {
        console.error('Failed to parse security credentials JSON from ENV:', e);
    }
} else if (jsonConfig.securityCredentials) {
    // Then config file
    if (typeof jsonConfig.securityCredentials === 'string') {
        try {
            securityCredentials = JSON.parse(jsonConfig.securityCredentials);
        } catch (e) {
            console.error('Failed to parse security credentials JSON from config file:', e);
        }
    } else if (typeof jsonConfig.securityCredentials === 'object') {
        securityCredentials = jsonConfig.securityCredentials;
    }
}

// Parse custom headers with same priority
let customHeaders: Record<string, string> = { ...customHeadersFromEnv };

// CLI has highest priority
if (argv.headers) {
    try {
        const headersFromArg = JSON.parse(argv.headers);
        customHeaders = { ...customHeaders, ...headersFromArg };
    } catch (e) {
        console.error('Failed to parse custom headers JSON from CLI:', e);
    }
} else if (envValues.headers) {
    // Then environment variables
    try {
        const headersFromEnv = JSON.parse(envValues.headers);
        customHeaders = { ...customHeaders, ...headersFromEnv };
    } catch (e) {
        console.error('Failed to parse custom headers JSON from ENV:', e);
    }
} else if (jsonConfig.headers) {
    // Then config file
    if (typeof jsonConfig.headers === 'string') {
        try {
            const headersFromConfig = JSON.parse(jsonConfig.headers);
            customHeaders = { ...customHeaders, ...headersFromConfig };
        } catch (e) {
            console.error('Failed to parse custom headers JSON from config file:', e);
        }
    } else if (typeof jsonConfig.headers === 'object') {
        customHeaders = { ...customHeaders, ...jsonConfig.headers };
    }
}

// Determine disableXMcp value with correct priority
const disableXMcp = argv.disableXMcp !== undefined ? argv.disableXMcp :
                    envValues.disableXMcp !== undefined ? envValues.disableXMcp :
                    jsonConfig.disableXMcp !== undefined ? jsonConfig.disableXMcp : false;

// Generate the final configuration object with correct priorities applied
export const config = {
    specPath: isHttpUrl(specPath) ? specPath : path.resolve(specPath),
    overlayPaths: overlays
        ? overlays.split(',').map((p: string) => isHttpUrl(p.trim()) ? p.trim() : path.resolve(p.trim()))
        : [],
    mcpPort: port,
    targetApiBaseUrl: targetUrl, // Now properly respects priority
    apiKey,
    securitySchemeName,
    securityCredentials,
    customHeaders,
    disableXMcp,
    filter: {
        whitelist: whitelist ? whitelist.split(',').map((pattern: string) => pattern.trim()) : null,
        blacklist: blacklist ? blacklist.split(',').map((pattern: string) => pattern.trim()) : [],
    },
};

console.error('Configuration loaded:');
console.error(`- OpenAPI Spec: ${config.specPath}`);
if (config.overlayPaths.length > 0) {
    console.error(`- Overlays: ${config.overlayPaths.join(', ')}`);
}
console.error(`- MCP Server Port: ${config.mcpPort}`);
if (config.targetApiBaseUrl) {
    console.error(`- Target API Base URL: ${config.targetApiBaseUrl}`);
} else {
    console.error(`- Target API Base URL: Will use 'servers' from OpenAPI spec.`);
}
if (config.filter.whitelist) {
    console.error(`- Whitelist Patterns: ${config.filter.whitelist.join(', ')} (supports glob patterns for operationId and URL paths)`);
} else if (config.filter.blacklist.length > 0) {
    console.error(`- Blacklist Patterns: ${config.filter.blacklist.join(', ')} (supports glob patterns for operationId and URL paths)`);
}
if (Object.keys(config.securityCredentials).length > 0) {
    console.error(`- Security Credentials: ${Object.keys(config.securityCredentials).join(', ')}`);
}
if (config.apiKey) {
    console.error('- API Key: [REDACTED]');
}
if (Object.keys(config.customHeaders).length > 0) {
    console.error(`- Custom Headers: ${Object.keys(config.customHeaders).join(', ')}`);
}
console.error(`- X-MCP Header: ${config.disableXMcp ? 'Disabled' : 'Enabled'}`);
