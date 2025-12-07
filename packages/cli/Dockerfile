FROM oven/bun:1

# Build arguments for user/group creation
ARG HOST_UID=1000
ARG HOST_GID=1001

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

# Create non-root user and group with host UID/GID
# Remove existing user/group if they conflict, then create vibekit user
RUN (getent passwd ${HOST_UID} && userdel -r $(getent passwd ${HOST_UID} | cut -d: -f1) || true) && \
    (getent group ${HOST_GID} && groupdel $(getent group ${HOST_GID} | cut -d: -f1) || true) && \
    groupadd -g ${HOST_GID} vibekit && \
    useradd -m -u ${HOST_UID} -g ${HOST_GID} -s /bin/bash vibekit

# Install Node.js for MCP server support
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y nodejs

# Set up Bun environment
ENV BUN_INSTALL="/home/vibekit/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Install coding agents globally
RUN bun add -g @anthropic-ai/claude-code@latest || echo "Claude CLI install failed"
RUN bun add -g @openai/codex@latest || echo "Codex CLI install failed"
RUN bun add -g @google/gemini-cli@latest || echo "Gemini CLI install failed"
RUN bun add -g opencode-ai@latest || echo "OpenCode CLI install failed"
RUN bun add -g @vibe-kit/grok-cli@latest || echo "Grok CLI install failed"

# Try alternative Claude installation
RUN curl -sSL https://install.anthropic.com | bash || echo "Alternative Claude install failed"
ENV PATH="/home/vibekit/.local/bin:$BUN_INSTALL/bin:$PATH"

# Install vibekit CLI globally and create symlink
RUN bun add -g vibekit || echo "Vibekit install failed"

# Create workspace directory and Claude directories, set ownership
RUN mkdir -p /workspace /home/vibekit/.claude && \
    chown -R vibekit:vibekit /workspace /home/vibekit

# Switch to non-root user
USER vibekit
WORKDIR /workspace

# Expose common local development ports
EXPOSE 3001
EXPOSE 8080

# Keep container running for persistent use
CMD ["tail", "-f", "/dev/null"]