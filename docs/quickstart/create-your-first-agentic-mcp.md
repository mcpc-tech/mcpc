# Create your first agentic MCP

Normal MCP Servers have tools that execute unit tasks and give feedback to LLM.
This provides extra context for the LLM to interact with the outer environment.

What if we take this a step further by predefining your task in a single agentic
tool?

**What benefits do you have?**

- Your built agent is reusable and portable to all major AI Clients/IDEs giving
  them all support MCP protocol;
- Reuse existing tools from MCP community with on-demand selecting and
  fine-tuning, For example:

  - An **MCP for desktop control,** like
    [desktop-commander](https://github.com/wonderwhy-er/DesktopCommanderMCP) or
    [claude code](https://docs.claude.com/en/docs/claude-code/mcp#use-claude-code-as-an-mcp-server)
    gives LLM terminal control, file system search and diff file editing
    capabilities, perfect for building your coding agent;
  - An **MCP for browser automation**, like
    [playwright](https://github.com/microsoft/playwright-mcp) provides LLM with
    browser automation capabilities, this enables you to build your web
    automation agent;
  - An **API Integration MCP,** like
    [github](https://github.com/github/github-mcp-server) or
    [notion](https://developers.notion.com/docs/mcp) lets an LLM interact with
    specific external systems, which is suitable for building **specialized
    workflow automation agents** (e.g., a DevOps assistant or a knowledge
    management bot).

**What does an agentic MCP require?**

- **Select the desired tools** and set up their corresponding **MCP transport
  configurations;**
- **Write a detailed description** of your target agent. This description should
  reference the selected tools**;**

See the magic in action 👇

# First Collect Your MCP Server Dependencies

The MCPC framework becomes truly powerful when you reuse and compose existing
MCP Servers, much like your favorite AI-integrated clients (e.g., Cursor or
VSCode). We offer full support for the MCP transport protocol, including
`stdio`, `sse`, `streamable-http`, and `memory` (in-memory).

```typescript
import { type ComposeDefinition, mcpc } from "@mcpc/core";

const deps: ComposeDefinition["deps"] = {
  mcpServers: {
    "desktop-commander": {
      command: "npx",
      args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
      transportType: "stdio",
    },
    "lsmcp": {
      command: "npx",
      args: ["-y", "@mizchi/lsmcp", "-p", "tsgo"],
      transportType: "stdio",
    },
    "github": {
      transportType: "streamable-http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`,
      },
    },
  },
};
```

> **💡 Tip**: For testing or embedding MCP servers in the same process, you can
> use `memory` transport. See
> [FAQ Q5](../faq.md#q5-what-transport-types-does-mcpc-support) for in-memory
> transport examples.

# Then write the documentation for your agent

A documentation for your agent helps LLM understand the purpose of the agent,
when to use it, how to use it

Agent documentation is crucial for telling an LLM what the agent does, when to
use it, and how to use it. Below is an example of a description of a coding
agent.

You might notice the xml-like tool syntax, it's designed for referencing
dependent MCP tools inside agent docs, `<tool>` tag has following properties:

- name(type string): it defines which tool to select from a dependent MCP
  server, syntax {mcp_server_name}.{tool_name};

Advanced properties:

- global(type boolean): default is false, referenced tools are cohesed in mcpc
  internal tools, by setting it to true, you can expose them on the MCP tools
  scope;
- hide(type boolean): default is false, it commonly used when you are overriding
  the tool with custom props or results

```typescript
const description =
  `You are a "codex fork" agent, a world-class AI assistant for coding tasks.

Workflow:
1. Project Overview: Use <tool name="lsmcp.get_project_overview"/> to understand the project structure.
2. Code Discovery: Locate relevant files using <tool name="lsmcp.search_symbols"/>, <tool name="desktop-commander.start_search"/>, or <tool name="desktop-commander.list_directory"/>.
3. Implementation: Apply changes with <tool name="desktop-commander.edit_block"/> and verify with <tool name="lsmcp.lsp_get_diagnostics"/>.
4. Build and Commit: Execute build commands with <tool name="desktop-commander.start_process"/>, then commit changes.
5. Submission: Create pull requests with <tool name="github.create_pull_request"/>.

Available tools:
<tool name="desktop-commander.start_process"/>
<tool name="desktop-commander.read_file"/>
<tool name="desktop-commander.write_file"/>
<tool name="desktop-commander.edit_block"/>
<tool name="desktop-commander.start_search"/>
<tool name="desktop-commander.list_directory"/>
<tool name="lsmcp.get_project_overview"/>
<tool name="lsmcp.search_symbols"/>
<tool name="lsmcp.lsp_get_definitions"/>
<tool name="lsmcp.lsp_get_diagnostics"/>
<tool name="github.create_pull_request"/>`;
```

# Start the agentic MCP server

Now the dependent MCPs and agent description are ready, let's start the server
using `mcpc` function.

## Create the MCP server

The `mcpc` function initializes an MCP server and helps manage its tool
dependencies. To maintain focus, these tools are hidden from the LLM by default.

You can choose one of two modes for internal tool invocation:

- **agentic (Default):** Works through standard, interactive calls where the
  agent explicitly invokes each tool with distinct arguments.
- **sampling (Experimental):** Uses a client-side feature that uses sampling to
  generate tool calls by requesting a response from the client's local LLM. This
  requires a compatible client, such as VS Code Copilot or a custom
  implementation.

```typescript
// description and deps are declared from above
const serverInitOpts = [
  {
    name: "coding-agent",
    version: "0.1.0",
  },
  { capabilities: { tools: {} } },
];

const server = mcpc(serverInitOpts, [
  {
    name: "coding-agent",
    options: {
      mode: "agentic",
    },
    description,
    deps,
  },
]);
```

## Connect to transports

For simplicity, the server will be connected to the MCP `stdio` transport as
shown below.

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const transport = new StdioServerTransport();
await server.connect(transport);
```

To verify the implementation, execute the following command:

```typescript
npx tsx server.ts
```

The server is operating as expected if no output is generated and no errors are
reported.

## Use it in your AI Clients/IDEs

You can use `coding-agent` inside any MCP-compatible clients.

Generic MCP-compatible clients:

```json
{
  "mcpServers": {
    "coding-agent": {
      "command": "npx",
      "args": [
        "tsx",
        "server.ts"
      ]
    }
  }
}
```

VS Code (supports sampling mode):

```json
{
  "servers": {
    "coding-agent": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "tsx",
        "server.ts"
      ]
    }
  }
}
```

Claude Code:

```bash
claude mcp add codex-fork -- npx tsx server.ts
```

Alternatively, to run this agent programmatically, we recommend using the
[AI SDK](./ai-sdk-integration.md) for LLM integration.
