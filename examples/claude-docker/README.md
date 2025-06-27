# Claude Docker Example

An example application demonstrating **Claude AI code generation** with **local Docker containers** using the VibeKit SDK. This project showcases how to run AI-powered coding tasks in isolated Docker environments on your local machine.

## 🔗 Features

- 🤖 **Claude AI Integration** - Powered by Anthropic's Claude for intelligent code generation
- 🐳 **Local Docker Execution** - Run code safely in isolated Docker containers  
- 🎨 **Modern UI** - Clean, responsive interface built with Next.js and Tailwind CSS
- 🛠️ **Flexible Docker Images** - Default VibeKit Claude sandbox with custom Docker image support
- 📊 **Task Management** - Track and monitor your AI coding tasks
- 🌙 **Dark Mode** - Toggle between light and dark themes
- 💾 **Persistent Storage** - Task history saved locally

## 🚀 Prerequisites

Before you begin, ensure you have:

- **Node.js** (v18 or higher)
- **Docker** installed and running on your machine
- **Anthropic API key** (get one at [console.anthropic.com](https://console.anthropic.com))
- **npm** or **yarn** package manager

### Docker Setup

Make sure Docker is installed and running:

```bash
# Check if Docker is running
docker --version
docker ps

# If Docker isn't running, start it through Docker Desktop or your system's Docker service
```

## 📦 Installation

### 1. Install Dependencies

Navigate to the claude-docker example directory:

```bash
cd examples/claude-docker
npm install
```

### 2. Environment Configuration

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Anthropic API key:

```bash
# Required: Anthropic API Key for Claude
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional: Docker Configuration (defaults will be used if not set)
# DOCKER_SOCKET_PATH=/var/run/docker.sock
# DOCKER_HOST=localhost  
# DOCKER_PORT=2375
# DOCKER_PROTOCOL=http
```

#### Getting Your Anthropic API Key:

1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in to your account
3. Navigate to the API keys section
4. Create a new API key
5. Copy the key to your `.env.local` file

## 🛠️ Development

### Start the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### Available Scripts

- `npm run dev` - Start the development server with Turbopack
- `npm run build` - Build the application for production
- `npm start` - Start the production server
- `npm run lint` - Run ESLint for code quality

## 🐳 Docker Integration

This example demonstrates the **DockerSandboxProvider** implementation, which allows Claude to execute code in local Docker containers. Here's how it works:

### Supported Docker Images

The application supports flexible Docker image selection:

- **Default: VibeKit Claude Sandbox** (`superagentai/vibekit-claude:1.0`) - Pre-configured environment optimized for Claude AI development
- **Custom Docker Images** - Any Docker image from Docker Hub or private registries (e.g., `ubuntu:22.04`, `python:3.11`, `node:18-alpine`, etc.)

### How It Works

1. **Task Submission**: You describe what you want Claude to build
2. **Environment Selection**: Choose between the default VibeKit Claude sandbox or specify a custom Docker image
3. **Container Creation**: VibeKit creates a new Docker container with proper labeling and session management
4. **Code Generation**: Claude generates and executes code in the isolated container
5. **Results Display**: View structured output including sandbox ID, exit codes, stdout, and stderr in an expandable format

### Docker Configuration

The DockerSandboxProvider supports various connection methods:

```typescript
// Local Docker socket (default)
environment: {
  docker: {
    socketPath: "/var/run/docker.sock"
  }
}

// Remote Docker daemon
environment: {
  docker: {
    host: "docker.example.com",
    port: 2376,
    protocol: "https",
    // TLS configuration for secure connections
    ca: "...", 
    cert: "...",
    key: "..."
  }
}
```

## 🎯 Usage Examples

Here are some tasks you can try:

### Python Development
```
Create a Python script that analyzes a CSV file and generates visualization charts using matplotlib
```

### Node.js API
```
Build a REST API with Express.js that handles user authentication and data persistence
```

### System Administration  
```
Write a bash script that monitors system resources and sends alerts when thresholds are exceeded
```

### Multi-language Project
```
Create a full-stack application with a Python Flask backend and React frontend
```

See [examples/task-examples.md](./examples/task-examples.md) for more detailed examples.

## 🏗️ Project Structure

```
claude-docker/
├── app/                    # Next.js App Router
│   ├── _components/        # Page-specific components
│   │   ├── task-form.tsx   # Task creation form
│   │   └── task-list.tsx   # Task management and display
│   ├── actions/           # Server actions
│   │   └── vibekit.ts     # Claude + Docker integration
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   ├── page.tsx          # Home page
│   └── client-page.tsx    # Main client component
├── components/            # Reusable UI components
│   ├── ui/               # shadcn/ui components
│   └── navbar.tsx        # Navigation bar
├── lib/                  # Utility libraries
│   └── utils.ts          # Common utilities
├── stores/               # Zustand state management
│   └── tasks.ts          # Task store
├── examples/             # Documentation and examples  
└── .env.example          # Environment variables template
```

## 🔧 Configuration

### VibeKit Configuration

The application configures VibeKit to use Claude with Docker:

```typescript
const config: VibeKitConfig = {
  agent: {
    type: "claude",
    model: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      provider: "anthropic", 
      name: "claude-3-5-sonnet-20241022",
    },
  },
  environment: {
    docker: {
      socketPath: "/var/run/docker.sock",
      image: "superagentai/vibekit-claude:1.0", // default VibeKit Claude sandbox
    },
  },
  sessionId: "unique-session-id",
};
```

### Task Management

Tasks are managed using Zustand for state management:

- **Persistent Storage**: Tasks are saved to localStorage
- **Real-time Updates**: Task status updates in real-time
- **Error Handling**: Proper error messages and status tracking

## 🐛 Troubleshooting

### Common Issues

1. **Docker Not Running**
   ```bash
   Error: connect ENOENT /var/run/docker.sock
   ```
   - **Solution**: Make sure Docker Desktop is running or Docker daemon is started

2. **Permission Denied (Docker Socket)**
   ```bash
   Error: connect EACCES /var/run/docker.sock
   ```
   - **Solution**: Add your user to the docker group or run with appropriate permissions

3. **API Key Issues**
   ```bash
   Error: ANTHROPIC_API_KEY environment variable is not set
   ```
   - **Solution**: Check that your `.env.local` file contains a valid Anthropic API key

4. **Image Pull Failures**
   ```bash
   Error: Failed to pull Docker image superagentai/vibekit-claude:1.0
   ```
   - **Solution**: Check your internet connection and Docker Hub access

### Docker Troubleshooting

```bash
# Check Docker status
docker --version
docker info

# List running containers (check if any vibekit containers exist)
docker ps -a --filter "label=sh.vibekit.group=vibekit-sandboxes"

# Check Docker logs
docker logs <container-id>

# Clean up stopped containers (this can help resolve session conflicts)
docker container prune

# Clean up unused containers and images
docker system prune

# Check Docker daemon is accessible
docker run hello-world
```

### Container Management

VibeKit automatically manages Docker containers with proper labeling:

- All containers are labeled with `sh.vibekit.group=vibekit-sandboxes`
- Each container has a unique session ID and timestamp-based naming
- Containers are created fresh for each task for isolation

To clean up VibeKit containers:

```bash
# Remove all VibeKit sandbox containers
docker rm $(docker ps -aq --filter "label=sh.vibekit.group=vibekit-sandboxes")

# Or use the general cleanup
docker container prune
```

## 🚀 Deployment

### Build for Production

```bash
npm run build
npm start
```

### Environment Variables for Production

Set the following environment variables in your production environment:

```bash
ANTHROPIC_API_KEY=your_production_api_key
DOCKER_SOCKET_PATH=/var/run/docker.sock  # or your Docker configuration
```

### Docker Considerations

- Ensure Docker is properly configured in your production environment
- Consider security implications of Docker socket access
- Monitor container resource usage and cleanup policies

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is part of the VibeKit SDK examples and follows the same license terms.

## 🆘 Getting Help

- **VibeKit Documentation**: [docs.vibekit.sh](https://docs.vibekit.sh)
- **Anthropic Claude API**: [docs.anthropic.com](https://docs.anthropic.com)
- **Docker Documentation**: [docs.docker.com](https://docs.docker.com)
- **Next.js Documentation**: [nextjs.org/docs](https://nextjs.org/docs)

---

Built with ❤️ using Claude AI, Docker, and VibeKit SDK