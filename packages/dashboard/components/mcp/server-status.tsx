import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ServerStatus = 'active' | 'inactive' | 'error' | 'connecting' | 'disconnected';

interface ServerStatusProps {
  status: ServerStatus;
  className?: string;
}

export function ServerStatusBadge({ status, className }: ServerStatusProps) {
  const statusConfig = {
    active: {
      label: 'Active',
      className: 'bg-green-500/10 text-green-500 border-green-500/20',
    },
    inactive: {
      label: 'Inactive',
      className: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    },
    error: {
      label: 'Error',
      className: 'bg-red-500/10 text-red-500 border-red-500/20',
    },
    connecting: {
      label: 'Connecting',
      className: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    },
    disconnected: {
      label: 'Disconnected',
      className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    },
  };

  const config = statusConfig[status];

  return (
    <Badge 
      variant="outline" 
      className={cn(config.className, className)}
    >
      <span className="relative flex h-2 w-2 mr-1.5">
        {status === 'active' && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        )}
        {status === 'connecting' && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
        )}
        <span className={cn(
          "relative inline-flex rounded-full h-2 w-2",
          {
            'bg-green-500': status === 'active',
            'bg-gray-500': status === 'inactive',
            'bg-red-500': status === 'error',
            'bg-blue-500': status === 'connecting',
            'bg-yellow-500': status === 'disconnected',
          }
        )}></span>
      </span>
      {config.label}
    </Badge>
  );
}