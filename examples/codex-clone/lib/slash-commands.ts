export interface SlashCommand {
  name: string;
  description: string;
  execute: (args: string[], mode: 'ask' | 'code') => {
    prompt: string;
    requiresSandbox: boolean;
    systemPrompt?: string;
  };
}

export const slashCommands: SlashCommand[] = [
  {
    name: '/fetch_news',
    description: 'Fetch latest news on a topic',
    execute: (args, mode) => {
      const topic = args.join(' ') || 'technology';
      
      if (mode === 'ask') {
        return {
          prompt: `Let's fetch some news together! I'll help you get the latest news. What topic are you interested in? (You mentioned: ${topic})`,
          requiresSandbox: false,
          systemPrompt: 'You are a helpful assistant that fetches news. Ask the user for: 1) Topic/subject, 2) Number of articles (1-10), 3) Format preference (summary, bullet points, or detailed). Then fetch the news using web search and present it in their preferred format.'
        };
      } else {
        return {
          prompt: `Fetch the 5 latest news articles about ${topic}. Present them in a clean, summarized format with titles, sources, and brief descriptions.`,
          requiresSandbox: false
        };
      }
    }
  },
  {
    name: '/weather',
    description: 'Get weather information',
    execute: (args, mode) => {
      const location = args.join(' ') || 'current location';
      
      if (mode === 'ask') {
        return {
          prompt: `I'll help you check the weather! What location would you like to check? (You mentioned: ${location})`,
          requiresSandbox: false,
          systemPrompt: 'You are a weather assistant. Ask the user for: 1) Specific location, 2) Time period (today, this week, specific date), 3) What details they need (temperature, precipitation, wind, etc). Then provide the weather information.'
        };
      } else {
        return {
          prompt: `Get the current weather and 3-day forecast for ${location}. Include temperature, conditions, and precipitation chance.`,
          requiresSandbox: false
        };
      }
    }
  },
  {
    name: '/joke',
    description: 'Tell a joke',
    execute: (args, mode) => {
      const topic = args.join(' ') || 'programming';
      
      return {
        prompt: mode === 'chat' 
          ? `Want to hear a joke? What kind of joke are you in the mood for? (You mentioned: ${topic})`
          : `Tell me a funny ${topic} joke.`,
        requiresSandbox: false
      };
    }
  },
  {
    name: '/test',
    description: 'Run a simple test without sandbox',
    execute: (args, mode) => {
      return {
        prompt: mode === 'chat'
          ? "I'm running in chat mode! I'll interact with you step by step. What would you like to test?"
          : "I'm running in agent mode! I'll complete this test autonomously. Testing: 1) Basic response, 2) Multi-step reasoning, 3) Completion confirmation. All systems operational!",
        requiresSandbox: false
      };
    }
  }
];

export function parseSlashCommand(input: string): { command: SlashCommand | null; args: string[] } {
  if (!input.startsWith('/')) {
    return { command: null, args: [] };
  }
  
  const parts = input.slice(1).split(' ');
  const commandName = '/' + parts[0];
  const args = parts.slice(1);
  
  const command = slashCommands.find(cmd => cmd.name === commandName);
  
  return { command, args };
}

export function getSlashCommandSuggestions(input: string): SlashCommand[] {
  if (!input.startsWith('/')) return [];
  
  const search = input.toLowerCase();
  return slashCommands.filter(cmd => 
    cmd.name.toLowerCase().startsWith(search)
  );
}