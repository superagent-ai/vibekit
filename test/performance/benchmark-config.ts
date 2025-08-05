/**
 * Phase 6: Performance Benchmark Configuration
 * 
 * Centralized configuration for performance benchmarking suite
 * with customizable settings for different testing scenarios.
 */

export interface BenchmarkConfiguration {
  // Data set sizes for testing
  datasets: {
    small: number;
    medium: number;
    large: number;
    stress: number;
  };
  
  // Performance thresholds in milliseconds
  thresholds: {
    singleInsert: number;
    batchInsert: number;
    simpleQuery: number;
    complexQuery: number;
    statsQuery: number;
    healthCheck: number;
  };
  
  // Resource limits
  resources: {
    maxMemoryMB: number;
    maxExecutionTimeMs: number;
    concurrentOperations: number;
  };
  
  // Test execution settings
  execution: {
    iterations: number;
    warmupIterations: number;
    timeoutMs: number;
    parallelTests: boolean;
  };
  
  // Reporting settings
  reporting: {
    saveResults: boolean;
    outputDirectory: string;
    includeRawData: boolean;
    generateCharts: boolean;
    consoleOutput: 'minimal' | 'detailed' | 'verbose';
  };
}

// Default configuration for comprehensive testing
export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfiguration = {
  datasets: {
    small: 100,
    medium: 1000,
    large: 10000,
    stress: 50000,
  },
  
  thresholds: {
    singleInsert: 5,
    batchInsert: 100,
    simpleQuery: 50,
    complexQuery: 200,
    statsQuery: 100,
    healthCheck: 10,
  },
  
  resources: {
    maxMemoryMB: 100,
    maxExecutionTimeMs: 300000, // 5 minutes
    concurrentOperations: 10,
  },
  
  execution: {
    iterations: 5,
    warmupIterations: 1,
    timeoutMs: 180000, // 3 minutes per test
    parallelTests: false, // Sequential for accurate memory measurements
  },
  
  reporting: {
    saveResults: true,
    outputDirectory: './benchmark-results',
    includeRawData: true,
    generateCharts: false, // Can be enabled if chart generation is implemented
    consoleOutput: 'detailed',
  },
};

// Configuration for quick testing during development
export const QUICK_BENCHMARK_CONFIG: BenchmarkConfiguration = {
  ...DEFAULT_BENCHMARK_CONFIG,
  datasets: {
    small: 50,
    medium: 200,
    large: 1000,
    stress: 5000,
  },
  execution: {
    iterations: 3,
    warmupIterations: 1,
    timeoutMs: 60000, // 1 minute per test
    parallelTests: false,
  },
  reporting: {
    ...DEFAULT_BENCHMARK_CONFIG.reporting,
    consoleOutput: 'minimal',
  },
};

// Configuration for stress testing
export const STRESS_BENCHMARK_CONFIG: BenchmarkConfiguration = {
  ...DEFAULT_BENCHMARK_CONFIG,
  datasets: {
    small: 500,
    medium: 5000,
    large: 50000,
    stress: 100000,
  },
  resources: {
    maxMemoryMB: 500,
    maxExecutionTimeMs: 900000, // 15 minutes
    concurrentOperations: 20,
  },
  execution: {
    iterations: 3,
    warmupIterations: 2,
    timeoutMs: 600000, // 10 minutes per test
    parallelTests: false,
  },
  thresholds: {
    singleInsert: 10,
    batchInsert: 500,
    simpleQuery: 100,
    complexQuery: 500,
    statsQuery: 300,
    healthCheck: 20,
  },
};

// Configuration for production baseline testing
export const PRODUCTION_BENCHMARK_CONFIG: BenchmarkConfiguration = {
  ...DEFAULT_BENCHMARK_CONFIG,
  datasets: {
    small: 1000,
    medium: 10000,
    large: 100000,
    stress: 500000,
  },
  execution: {
    iterations: 10,
    warmupIterations: 3,
    timeoutMs: 1800000, // 30 minutes per test
    parallelTests: false,
  },
  resources: {
    maxMemoryMB: 200,
    maxExecutionTimeMs: 3600000, // 1 hour
    concurrentOperations: 50,
  },
  reporting: {
    ...DEFAULT_BENCHMARK_CONFIG.reporting,
    consoleOutput: 'verbose',
    generateCharts: true,
  },
};

/**
 * Performance target definitions based on system requirements
 */
export const PERFORMANCE_TARGETS = {
  // Minimum acceptable performance (baseline)
  minimum: {
    insertRate: 1000, // events per second
    queryLatency: 100, // milliseconds
    memoryEfficiency: 0.1, // MB per 1000 events
    concurrentUsers: 10,
  },
  
  // Target performance (goal)
  target: {
    insertRate: 10000, // events per second
    queryLatency: 50, // milliseconds
    memoryEfficiency: 0.05, // MB per 1000 events
    concurrentUsers: 50,
  },
  
  // Excellent performance (stretch goal)
  excellent: {
    insertRate: 50000, // events per second
    queryLatency: 10, // milliseconds
    memoryEfficiency: 0.01, // MB per 1000 events
    concurrentUsers: 100,
  },
};

/**
 * Test scenarios for specific use cases
 */
export const BENCHMARK_SCENARIOS = {
  // Real-time streaming scenario
  realTimeStreaming: {
    description: 'High-frequency real-time event streaming',
    eventFrequency: 100, // events per second
    sessionDuration: 300, // seconds
    bufferSize: 50,
    flushInterval: 1000, // milliseconds
  },
  
  // Batch processing scenario
  batchProcessing: {
    description: 'Periodic batch processing of accumulated events',
    batchSize: 1000,
    batchFrequency: 60, // seconds between batches
    retentionDays: 30,
  },
  
  // Analytics workload scenario
  analyticsWorkload: {
    description: 'Complex analytical queries on historical data',
    dataRetentionDays: 90,
    queryComplexity: 'high',
    reportingFrequency: 3600, // seconds (hourly reports)
  },
  
  // Development scenario
  development: {
    description: 'Typical development workflow with telemetry',
    sessionsPerDay: 50,
    eventsPerSession: 100,
    agentTypes: ['claude', 'codex', 'gemini'],
    modes: ['chat', 'edit', 'build'],
  },
};

/**
 * Helper function to get configuration by name
 */
export function getBenchmarkConfig(configName: string): BenchmarkConfiguration {
  switch (configName.toLowerCase()) {
    case 'quick':
      return QUICK_BENCHMARK_CONFIG;
    case 'stress':
      return STRESS_BENCHMARK_CONFIG;
    case 'production':
      return PRODUCTION_BENCHMARK_CONFIG;
    case 'default':
    default:
      return DEFAULT_BENCHMARK_CONFIG;
  }
}

/**
 * Validate benchmark configuration
 */
export function validateBenchmarkConfig(config: BenchmarkConfiguration): string[] {
  const errors: string[] = [];
  
  // Validate dataset sizes
  if (config.datasets.small <= 0) errors.push('Small dataset size must be positive');
  if (config.datasets.medium <= config.datasets.small) errors.push('Medium dataset must be larger than small');
  if (config.datasets.large <= config.datasets.medium) errors.push('Large dataset must be larger than medium');
  if (config.datasets.stress <= config.datasets.large) errors.push('Stress dataset must be larger than large');
  
  // Validate thresholds
  if (config.thresholds.singleInsert <= 0) errors.push('Single insert threshold must be positive');
  if (config.thresholds.batchInsert <= 0) errors.push('Batch insert threshold must be positive');
  if (config.thresholds.simpleQuery <= 0) errors.push('Simple query threshold must be positive');
  
  // Validate resources
  if (config.resources.maxMemoryMB <= 0) errors.push('Max memory must be positive');
  if (config.resources.concurrentOperations <= 0) errors.push('Concurrent operations must be positive');
  
  // Validate execution settings
  if (config.execution.iterations <= 0) errors.push('Iterations must be positive');
  if (config.execution.timeoutMs <= 0) errors.push('Timeout must be positive');
  
  return errors;
} 