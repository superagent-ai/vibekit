// Set up test environment variables
process.env.E2B_API_KEY = 'test-e2b-api-key'
process.env.OPENAI_API_KEY = 'test-openai-api-key'
process.env.INNGEST_SIGNING_KEY = 'test-inngest-signing-key'
process.env.INNGEST_EVENT_KEY = 'test-inngest-event-key'
process.env.NEXTAUTH_SECRET = 'test-nextauth-secret'
process.env.GITHUB_CLIENT_ID = 'test-github-client-id'
process.env.GITHUB_CLIENT_SECRET = 'test-github-client-secret'

// Export for use in tests
export const testEnv = {
  E2B_API_KEY: process.env.E2B_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
  INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
}