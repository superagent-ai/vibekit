#!/usr/bin/env tsx
/**
 * Phase 6: Performance Benchmark Runner
 * 
 * Script to execute performance benchmarks with different configurations
 * and generate comprehensive reports comparing legacy vs Drizzle implementations.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { performance } from 'perf_hooks';
import { 
  getBenchmarkConfig, 
  validateBenchmarkConfig,
  PERFORMANCE_TARGETS,
  BenchmarkConfiguration
} from '../test/performance/benchmark-config';

interface BenchmarkRunResult {
  configName: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  testResults?: any;
  errorMessage?: string;
  outputFile?: string;
}

class BenchmarkRunner {
  private results: BenchmarkRunResult[] = [];
  private outputDir: string;
  
  constructor(outputDir = './benchmark-results') {
    this.outputDir = resolve(outputDir);
    this.ensureOutputDirectory();
  }
  
  private ensureOutputDirectory(): void {
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }
  
  /**
   * Run benchmarks with a specific configuration
   */
  async runBenchmarks(configName: string): Promise<BenchmarkRunResult> {
    console.log(`\n🚀 Starting benchmark run: ${configName.toUpperCase()}`);
    console.log('='.repeat(60));
    
    const config = getBenchmarkConfig(configName);
    const validation = validateBenchmarkConfig(config);
    
    if (validation.length > 0) {
      const error = `Invalid configuration: ${validation.join(', ')}`;
      console.error(`❌ ${error}`);
      return {
        configName,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 0,
        success: false,
        errorMessage: error,
      };
    }
    
    const startTime = performance.now();
    const result: BenchmarkRunResult = {
      configName,
      startTime,
      endTime: 0,
      duration: 0,
      success: false,
    };
    
    try {
      // Create configuration-specific output file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputFile = join(this.outputDir, `benchmark-${configName}-${timestamp}.json`);
      
      // Set environment variables for the test
      const env = {
        ...process.env,
        BENCHMARK_CONFIG: configName,
        BENCHMARK_OUTPUT: outputFile,
      };
      
      console.log(`📊 Running tests with ${configName} configuration...`);
      console.log(`📁 Output will be saved to: ${outputFile}`);
      
      // Run the benchmark test suite
      const testCommand = [
        'npx', 'vitest', 'run',
        'test/performance/benchmark-direct.test.ts',
        '--reporter=verbose',
        '--no-coverage',
        `--testTimeout=${config.execution.timeoutMs}`,
      ];
      
      const testProcess = spawn(testCommand[0], testCommand.slice(1), {
        cwd: process.cwd(),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      let stdout = '';
      let stderr = '';
      
      testProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        if (config.reporting.consoleOutput !== 'minimal') {
          process.stdout.write(output);
        }
      });
      
      testProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        if (config.reporting.consoleOutput === 'verbose') {
          process.stderr.write(output);
        }
      });
      
      const exitCode = await new Promise<number>((resolve) => {
        testProcess.on('close', resolve);
      });
      
      const endTime = performance.now();
      result.endTime = endTime;
      result.duration = endTime - startTime;
      result.success = exitCode === 0;
      result.outputFile = outputFile;
      
      if (result.success) {
        console.log(`✅ Benchmark completed successfully in ${(result.duration / 1000).toFixed(2)}s`);
        
        // Try to load and parse test results
        if (existsSync(outputFile)) {
          try {
            const testResults = JSON.parse(readFileSync(outputFile, 'utf-8'));
            result.testResults = testResults;
          } catch (error) {
            console.warn(`⚠️  Could not parse test results: ${error}`);
          }
        }
      } else {
        result.errorMessage = `Test execution failed with exit code ${exitCode}`;
        console.error(`❌ Benchmark failed: ${result.errorMessage}`);
        if (stderr) {
          console.error('Error output:', stderr);
        }
      }
      
    } catch (error) {
      const endTime = performance.now();
      result.endTime = endTime;
      result.duration = endTime - startTime;
      result.errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Benchmark execution error: ${result.errorMessage}`);
    }
    
    this.results.push(result);
    return result;
  }
  
  /**
   * Run multiple benchmark configurations
   */
  async runMultipleConfigurations(configNames: string[]): Promise<void> {
    console.log(`\n🎯 Running benchmarks with ${configNames.length} configurations`);
    console.log(`📁 Results will be saved to: ${this.outputDir}`);
    
    for (const configName of configNames) {
      await this.runBenchmarks(configName);
      
      // Add delay between runs to allow system to settle
      if (configNames.indexOf(configName) < configNames.length - 1) {
        console.log('\n⏳ Waiting 5 seconds before next benchmark...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Generate summary report
    this.generateSummaryReport();
  }
  
  /**
   * Generate comprehensive summary report
   */
  private generateSummaryReport(): void {
    console.log('\n📋 Generating summary report...');
    
    const timestamp = new Date().toISOString();
    const summaryFile = join(this.outputDir, `benchmark-summary-${timestamp.replace(/[:.]/g, '-')}.md`);
    
    let report = '# Phase 6: Performance Benchmark Summary Report\n\n';
    report += `**Generated:** ${timestamp}\n`;
    report += `**Total Runs:** ${this.results.length}\n`;
    report += `**Success Rate:** ${this.results.filter(r => r.success).length}/${this.results.length} (${Math.round(this.results.filter(r => r.success).length / this.results.length * 100)}%)\n\n`;
    
    // Execution summary
    report += '## Execution Summary\n\n';
    report += '| Configuration | Duration | Status | Output File |\n';
    report += '|---------------|----------|--------|-----------|\n';
    
    for (const result of this.results) {
      const duration = (result.duration / 1000).toFixed(2) + 's';
      const status = result.success ? '✅ Success' : '❌ Failed';
      const outputFile = result.outputFile ? result.outputFile.split('/').pop() : 'N/A';
      report += `| ${result.configName} | ${duration} | ${status} | ${outputFile} |\n`;
    }
    
    // Performance analysis
    if (this.results.some(r => r.success && r.testResults)) {
      report += '\n## Performance Analysis\n\n';
      
      const successfulResults = this.results.filter(r => r.success && r.testResults);
      
      for (const result of successfulResults) {
        if (result.testResults) {
          report += `### ${result.configName.toUpperCase()} Configuration\n\n`;
          
          if (result.testResults.summary) {
            const summary = result.testResults.summary;
            report += `- **Total Operations:** ${summary.totalOperations}\n`;
            report += `- **Drizzle Wins:** ${summary.drizzleWins}\n`;
            report += `- **Legacy Wins:** ${summary.legacyWins}\n`;
            report += `- **Ties:** ${summary.ties}\n\n`;
          }
          
          if (result.testResults.comparisons) {
            report += '#### Key Performance Comparisons\n\n';
            
            const comparisons = result.testResults.comparisons;
            const significantImprovements = comparisons.filter((c: any) => 
              Math.abs(c.performanceImprovement) > 10
            );
            
            if (significantImprovements.length > 0) {
              report += '**Significant Performance Differences (>10%):**\n\n';
              for (const comp of significantImprovements) {
                const improvement = comp.performanceImprovement > 0 ? 
                  `${comp.performanceImprovement.toFixed(1)}% faster` : 
                  `${Math.abs(comp.performanceImprovement).toFixed(1)}% slower`;
                report += `- **${comp.operation}** (${comp.dataSize} items): Drizzle is ${improvement}\n`;
              }
              report += '\n';
            }
          }
        }
      }
    }
    
    // Recommendations
    report += '## Recommendations\n\n';
    
    const successfulRuns = this.results.filter(r => r.success);
    const failedRuns = this.results.filter(r => !r.success);
    
    if (failedRuns.length > 0) {
      report += '### Issues to Address\n\n';
      for (const failed of failedRuns) {
        report += `- **${failed.configName}**: ${failed.errorMessage}\n`;
      }
      report += '\n';
    }
    
    if (successfulRuns.length > 0) {
      report += '### Performance Assessment\n\n';
      
      // Check if we have detailed test results
      const hasDetailedResults = successfulRuns.some(r => r.testResults?.comparisons);
      
      if (hasDetailedResults) {
        const allComparisons = successfulRuns
          .filter(r => r.testResults?.comparisons)
          .flatMap(r => r.testResults.comparisons);
        
        const drizzleWins = allComparisons.filter((c: any) => c.winner === 'drizzle').length;
        const totalComparisons = allComparisons.length;
        const winRate = (drizzleWins / totalComparisons) * 100;
        
        if (winRate >= 80) {
          report += '✅ **Excellent Performance**: Drizzle implementation significantly outperforms legacy system\n';
        } else if (winRate >= 60) {
          report += '⚠️ **Good Performance**: Drizzle implementation generally outperforms legacy system with some areas for improvement\n';
        } else if (winRate >= 40) {
          report += '⚠️ **Mixed Performance**: Performance is roughly equivalent between implementations\n';
        } else {
          report += '❌ **Performance Concerns**: Legacy system outperforms Drizzle implementation in most scenarios\n';
        }
        
        report += `- **Overall Win Rate**: ${winRate.toFixed(1)}% (${drizzleWins}/${totalComparisons} operations)\n`;
      }
      
      report += '- **Production Readiness**: ';
      if (successfulRuns.length === this.results.length) {
        report += 'All benchmark configurations completed successfully\n';
      } else {
        report += `${successfulRuns.length}/${this.results.length} configurations completed successfully\n`;
      }
    }
    
    // Performance targets assessment
    report += '\n### Performance Targets\n\n';
    report += '**Target Requirements:**\n';
    report += `- Insert Rate: ${PERFORMANCE_TARGETS.target.insertRate} events/sec\n`;
    report += `- Query Latency: ${PERFORMANCE_TARGETS.target.queryLatency}ms\n`;
    report += `- Memory Efficiency: ${PERFORMANCE_TARGETS.target.memoryEfficiency} MB/1000 events\n`;
    report += `- Concurrent Users: ${PERFORMANCE_TARGETS.target.concurrentUsers}\n\n`;
    
    // Next steps
    report += '## Next Steps\n\n';
    
    if (failedRuns.length > 0) {
      report += '1. **Fix Failed Configurations**: Address issues preventing benchmark completion\n';
    }
    
    report += '2. **Performance Optimization**: Focus on areas where legacy system outperforms Drizzle\n';
    report += '3. **Production Testing**: Validate performance with real-world data patterns\n';
    report += '4. **Monitoring Setup**: Implement performance monitoring for production deployment\n';
    report += '5. **Documentation**: Update performance specifications based on benchmark results\n\n';
    
    // File locations
    report += '## Files Generated\n\n';
    for (const result of this.results) {
      if (result.outputFile) {
        report += `- **${result.configName}**: \`${result.outputFile}\`\n`;
      }
    }
    
    writeFileSync(summaryFile, report);
    console.log(`📄 Summary report saved to: ${summaryFile}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'default';
  
  const runner = new BenchmarkRunner();
  
  switch (command) {
    case 'quick':
      await runner.runBenchmarks('quick');
      break;
      
    case 'stress':
      await runner.runBenchmarks('stress');
      break;
      
    case 'production':
      await runner.runBenchmarks('production');
      break;
      
    case 'all':
      await runner.runMultipleConfigurations(['quick', 'default', 'stress']);
      break;
      
    case 'help':
      console.log(`
📊 Phase 6 Performance Benchmark Runner

Usage: tsx scripts/run-benchmarks.ts [command]

Commands:
  quick       Run quick benchmarks (small datasets, fewer iterations)
  default     Run standard benchmarks (recommended for development)
  stress      Run stress tests (large datasets, high concurrency)
  production  Run production-grade benchmarks (comprehensive testing)
  all         Run all configurations sequentially
  help        Show this help message

Examples:
  tsx scripts/run-benchmarks.ts quick
  tsx scripts/run-benchmarks.ts production
  tsx scripts/run-benchmarks.ts all

Results are saved to ./benchmark-results/ directory.
      `);
      break;
      
    case 'default':
    default:
      await runner.runBenchmarks('default');
      break;
  }
  
  console.log('\n🎉 Benchmark execution completed!');
}

// Handle errors and exit gracefully
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});

// Run the CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Benchmark runner failed:', error);
    process.exit(1);
  });
}

export { BenchmarkRunner }; 