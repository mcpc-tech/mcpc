FROM denoland/deno:latest

# Create working directory
WORKDIR /app

RUN deno cache jsr:@mcpc/code-runner-mcp

# Run the app
ENTRYPOINT ["deno", "run", "--allow-all", "jsr:@mcpc/code-runner-mcp/bin"]