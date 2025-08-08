import React from 'react';
import {Text, Box} from 'ink';

const StatusDisplay = ({agentName, options = {}, settings = {}, sandboxConfig = {}}) => {
  const proxyStatus = options.proxy ? 'ON' : 'OFF';
  
  const getSandboxStatus = () => {
    if (!sandboxConfig.enabled) return { text: 'OFF', color: 'red' };
    return { text: `ON (${sandboxConfig.type})`, color: 'green' };
  };
  
  const sandboxStatus = getSandboxStatus();

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>
        🖖 VibeKit | Sandbox: <Text color={sandboxStatus.color}>{sandboxStatus.text}</Text> | Proxy: <Text color={options.proxy ? 'green' : 'red'}>{proxyStatus}</Text> | Dashboard: <Text color="cyan">http://localhost:3001</Text>
      </Text>
      <Text> </Text>
    </Box>
  );
};

export default StatusDisplay;
