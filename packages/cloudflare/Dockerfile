FROM docker.io/cloudflare/sandbox:0.1.3

# Set up Bun environment
ENV BUN_INSTALL="/home/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"
RUN bun add -g @anthropic-ai/claude-code@latest
RUN bun add -g @openai/codex@latest
RUN bun add -g @google/gemini-cli@latest
RUN bun add -g opencode-ai@latest
RUN bun add -g @vibe-kit/grok-cli@latest

# Expose common local development ports
# https://developers.cloudflare.com/containers/local-dev/#exposing-ports
# Currently, only explicitly exposed ports can be used for port-forwarding
# when developing locally. In prod, any port can be accessed and this is
# not needed.
EXPOSE 3001
EXPOSE 8080

# Run the same command as the original image
CMD ["bun", "index.ts"]
