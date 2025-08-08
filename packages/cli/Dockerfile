FROM oven/bun:1

# Install system dependencies including build tools for native modules
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    wget \
    git \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set up Bun environment
ENV BUN_INSTALL="/home/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Install coding agents globally
RUN bun add -g @anthropic-ai/claude-code@latest || echo "Claude CLI install failed"
RUN bun add -g @openai/codex@latest || echo "Codex CLI install failed"  
RUN bun add -g @google/gemini-cli@latest || echo "Gemini CLI install failed"
RUN bun add -g opencode-ai@latest || echo "OpenCode CLI install failed"
RUN bun add -g @vibe-kit/grok-cli@latest || echo "Grok CLI install failed"

# Try alternative Claude installation
RUN curl -sSL https://install.anthropic.com | bash || echo "Alternative Claude install failed"
ENV PATH="/root/.local/bin:$BUN_INSTALL/bin:$PATH"

# Install vibekit CLI globally and create symlink
RUN bun add -g vibekit || echo "Vibekit install failed"

# Create workspace directory
RUN mkdir -p /workspace
WORKDIR /workspace

# Expose common local development ports
EXPOSE 3001
EXPOSE 8080

# Keep container running for persistent use
CMD ["tail", "-f", "/dev/null"]