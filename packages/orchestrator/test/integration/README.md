# Integration Tests for VibeKit Orchestrator

This directory contains **real Docker integration tests** that validate the orchestrator sandbox implementation using actual Docker containers, not mocks.

## 🚨 Critical Difference from Unit Tests

**Unit Tests (`test/unit/`)**: Use mocked Dagger clients - they pass even when Docker is offline  
**Integration Tests (`test/integration/`)**: Use real Dagger connections and Docker containers

## Prerequisites

### Required
- **Docker**: Must be running and accessible via `docker` command
- **VibeKit Image**: The `vibekit-sandbox:latest` image must exist locally

### Check Prerequisites
```bash
# Verify Docker is running
docker version

# Verify VibeKit image exists
docker images vibekit-sandbox:latest

# If image doesn't exist, you may need to build it
# (Check main VibeKit documentation for build instructions)
```

## Running Integration Tests

### All Integration Tests
```bash
npm run test:integration
```

### Docker-Specific Tests Only
```bash  
npm run test:integration:docker
```

### Watch Mode (for development)
```bash
npm run test:integration:watch
```

### Unit Tests (Mocked - for comparison)
```bash
npm test
```

## Test Categories

### 1. OrchestratorSandbox Integration Tests
**File**: `sandbox/orchestrator-sandbox.integration.test.ts`

Tests:
- ✅ Real Docker container creation and initialization
- ✅ VibeKit image performance validation (< 10 seconds vs 2+ minutes for Ubuntu)  
- ✅ Worktree operations with actual containers
- ✅ Task container creation with optimized image
- ✅ Command execution in containers
- ✅ Resource cleanup verification

### 2. TaskSandbox Integration Tests
**File**: `sandbox/task-sandbox.integration.test.ts`

Tests:
- ✅ Agent initialization with VibeKit image (all agent types)
- ✅ Task execution in real containers
- ✅ Working directory and file operations
- ✅ VibeKit tools verification (Node.js, Python, Git, etc.)
- ✅ Environment variable validation
- ✅ Performance benchmarking and optimization validation

## What These Tests Validate

### 🚀 Performance Optimization
- **Before**: Ubuntu containers with `apt-get install` (2+ minutes startup)
- **After**: Pre-built `vibekit-sandbox:latest` image (< 10 seconds startup)
- **Validation**: Tests measure and verify ~100x speed improvement

### 🐳 Real Docker Operations
- Actual container creation (visible in `docker ps` during test execution)
- Real command execution inside containers
- Proper environment variable passing
- Resource cleanup verification

### 🔧 VibeKit Image Contents
- Node.js availability and version
- Python 3 availability and version  
- Git availability and functionality
- Essential development tools
- Proper environment variable setup

## Test Configuration

### Integration Config: `vitest.integration.config.ts`
- **Sequential execution**: Prevents Docker conflicts
- **Extended timeouts**: 60 seconds per test, 30 seconds for setup
- **Detailed reporting**: Verbose output for debugging
- **Environment isolation**: Separate from unit tests

### Helper Utilities: `docker-test-helpers.ts`
- Docker availability checking
- VibeKit image validation
- Container monitoring and cleanup
- Performance measurement utilities
- Test session management

## Test Output Examples

### Successful Test Run
```
✅ Sandbox initialized in 1247ms
✅ Task execution completed in 3891ms  
✅ Container test successful - Node.js: v24.5.0
📊 Performance Summary: Average: 2847ms, Maximum: 3891ms
🚀 Performance improvement: ~42x faster than Ubuntu + package installation
```

### Skipped Tests (Docker Unavailable)
```
⚠️  Docker not available, skipping integration tests
⚠️  VibeKit image not available, skipping integration tests
```

## Troubleshooting

### Tests Fail with Connection Errors
- Ensure Docker daemon is running: `docker version`
- Check Docker permissions: `docker ps` 
- Verify Dagger connectivity (tests will show specific error)

### Tests Time Out
- Check Docker resource limits (memory/CPU)
- Verify VibeKit image size and availability
- Check for competing Docker processes

### No Containers Visible in `docker ps`
- ✅ This is **expected** - containers are ephemeral and cleaned up quickly
- Use `docker ps -a` to see recently exited containers
- Tests include container monitoring during execution

### Image Not Found Errors
- Build or pull the VibeKit image: `vibekit-sandbox:latest`
- Check image availability: `docker images vibekit-sandbox:latest`

## Development Tips

### Debugging Integration Tests
```bash
# Run with verbose output
npm run test:integration:docker -- --reporter=verbose

# Run specific test file
npx vitest run -c vitest.integration.config.ts test/integration/sandbox/orchestrator-sandbox.integration.test.ts

# Enable detailed Docker logging
VIBEKIT_DEBUG=true npm run test:integration
```

### Monitoring Docker During Tests
```bash
# In another terminal, watch containers
watch -n 1 'docker ps && echo "---" && docker ps -a | head -5'

# Monitor Docker resource usage
docker stats --no-stream
```

### Creating New Integration Tests
1. Use `DockerTestHelpers` utilities for common operations
2. Always check Docker availability with `beforeAll` hook
3. Clean up resources in `afterEach` hook  
4. Use realistic timeouts (Docker operations can take time)
5. Measure performance when validating optimizations

## Integration vs Unit Test Comparison

| Aspect | Unit Tests | Integration Tests |
|--------|------------|------------------|
| **Dagger Client** | Mocked | Real connection |
| **Docker Containers** | Fake | Actual containers |
| **Speed** | Fast (~seconds) | Slower (~minutes) |
| **Dependencies** | None | Docker + VibeKit image |
| **Purpose** | API contracts | End-to-end validation |
| **When to Run** | Always (CI/CD) | Before releases |

## Continuous Integration

For CI/CD pipelines:
```yaml
# Ensure Docker is available
- name: Setup Docker
  uses: docker/setup-docker@v1

# Verify VibeKit image (build if needed)
- name: Build VibeKit Image  
  run: docker build -t vibekit-sandbox:latest .

# Run integration tests
- name: Integration Tests
  run: npm run test:integration
```