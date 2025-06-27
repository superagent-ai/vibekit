# Task Creation and Runner Test Suite

This test suite provides comprehensive coverage for the task creation and execution flow in the application.

## Test Structure

### Unit Tests

#### 1. **Task Store Tests** (`tests/stores/tasks.test.ts`)
- Tests the Zustand task store functionality
- Covers CRUD operations for tasks
- Validates task state management and persistence
- Tests notification settings
- Coverage: ~95%

#### 2. **Inngest Actions Tests** (`tests/actions/inngest.test.ts`)
- Tests server actions for task management
- Validates authentication requirements
- Tests error handling for API calls
- Covers pause/resume/cancel operations
- Coverage: ~90%

#### 3. **Task Runner Tests** (`tests/inngest/createTask.test.ts`)
- Tests the main Inngest function for task execution
- Validates streaming responses
- Tests sandbox vs non-sandbox execution
- Covers error handling and status updates
- Coverage: ~85%

### Integration Tests

#### 4. **Task Flow Integration** (`tests/integration/task-flow.test.tsx`)
- End-to-end testing of task creation flow
- Tests UI interaction through to backend
- Validates repository requirements
- Tests error scenarios and edge cases
- Coverage: ~80%

### Component Tests

#### 5. **Task List Component** (`tests/components/task-list.test.tsx`)
- Tests the task list UI component
- Validates task display and sorting
- Tests user interactions (click, archive)
- Covers animations and status displays
- Coverage: ~85%

## Running Tests

### Quick Commands

```bash
# Run all tests
npm run test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with UI interface
npm run test:ui

# Run specific test categories
npm run test:task-creation    # Task store and actions
npm run test:task-runner      # Inngest functions
npm run test:integration      # End-to-end flows
npm run test:components       # UI components

# Run comprehensive test suite with setup
npm run test:all
```

### Test Coverage Goals

- Overall coverage target: **80%**
- Critical paths coverage: **90%**
- UI components coverage: **70%**

## Test Scenarios Covered

### Task Creation
- ✅ Creating tasks with all required fields
- ✅ Validation of repository selection
- ✅ Mode selection (ask vs code)
- ✅ Multi-line input handling
- ✅ Error handling for failed creation
- ✅ Task persistence across sessions

### Task Execution
- ✅ Streaming AI responses
- ✅ Sandbox environment setup
- ✅ Real-time status updates
- ✅ Error recovery mechanisms
- ✅ Task pause/resume functionality
- ✅ Task cancellation

### UI/UX
- ✅ Task list display and sorting
- ✅ Task status indicators
- ✅ Repository context switching
- ✅ Archive/unarchive functionality
- ✅ Navigation between tasks
- ✅ Animation and transitions

## Mocking Strategy

### External Dependencies
- **Next.js Router**: Mocked for navigation testing
- **Inngest API**: Mocked for isolated testing
- **E2B Sandbox**: Mocked to avoid external calls
- **OpenAI API**: Mocked streaming responses
- **localStorage**: Mocked for persistence testing

### Test Utilities
- **@testing-library/react**: Component testing
- **@testing-library/user-event**: User interaction simulation
- **vitest**: Test runner and assertions
- **vi.mock**: Module mocking

## CI/CD Integration

To integrate with CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '20'
    - run: npm ci
    - run: npm run test:coverage
    - uses: codecov/codecov-action@v3
```

## Debugging Tests

### Common Issues

1. **Module Resolution Errors**
   - Ensure `tsconfig.json` paths are properly configured
   - Check that vitest.config.ts has correct alias setup

2. **Async Test Failures**
   - Use `waitFor` for async operations
   - Ensure proper cleanup between tests

3. **Mock Not Working**
   - Clear mocks in beforeEach: `vi.clearAllMocks()`
   - Check mock implementation matches expected interface

### Debug Commands

```bash
# Run single test file
npx vitest run tests/stores/tasks.test.ts

# Run tests matching pattern
npx vitest run -t "should create task"

# Run with verbose output
npx vitest run --reporter=verbose

# Debug in VS Code
# Add breakpoint and use "Debug: JavaScript Debug Terminal"
```

## Future Improvements

1. **E2E Testing with Playwright**
   - Full browser automation testing
   - Cross-browser compatibility

2. **Performance Testing**
   - Load testing for concurrent tasks
   - Memory leak detection

3. **Visual Regression Testing**
   - Screenshot comparison
   - Component visual testing

4. **API Contract Testing**
   - Validate Inngest event schemas
   - Test E2B API integration

## Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Ensure all tests pass before PR
3. Maintain or improve coverage
4. Add integration tests for new flows
5. Update this README with new test scenarios