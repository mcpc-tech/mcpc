# Achieving Agent Interoperability

By defining individual agents as agentic MCP tools, we create a framework where
they can cooperate, orchestrated by an LLM. This approach enables true agent
interoperability, much like an Agent-to-Agent (A2A) communication protocol.

This is achieved through two key mechanisms:

- **Dynamic Capability Discovery:** An LLM can dynamically discover the
  capabilities of each agent. Because every agent is exposed as a standard MCP
  tool, its functions are described as tool definitions and passed to the
  controlling LLM with each request. This allows for a dynamic, on-the-fly
  integration of different agents.
- **LLM-Mediated Collaboration:** Collaboration between agents is mediated by
  the LLM. One agent can invoke another by making a standard tool call through
  the LLM. The LLM then routes the request to the appropriate agent tool,
  collects the result, and returns it as feedback. This creates a seamless
  workflow where multiple specialized agents can work together to solve complex
  problems.
