# Agentic MCP Tools

# What is an Agentic MCP tool

An Agentic MCP tool is a tool that acts like an agent, designed to complete
complex tasks by calling dependent MCP tools within a multi-step loop.

# How it works

While a normal agent calls an LLM in a loop for each step (e.g., for reasoning
or tool calls), an Agentic MCP tool is primarily a tool whose behavior depends
on the selected mode.

**Agentic Mode:** The LLM interactively generates tool calls for the agentic
tool. It provides different arguments to call various dependent MCP tools,
allowing it to complete the overall agent task.

**Sampling Mode:** A single call to the agentic tool initiates an LLM request
loop using the client's LLM. This process calls dependent MCP tools in each
step, creating a "mini-agent" that operates inside the tool.
