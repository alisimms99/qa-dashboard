import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AlertCircle, CheckCircle, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function WebhookHealthIndicator() {
  const [showDetails, setShowDetails] = useState(false);
  const { data: health, refetch } = trpc.webhooks.getHealth.useQuery(undefined, {
    refetchInterval: 60000, // Refresh every minute
  });

  if (!health) return null;

  const getStatusColor = () => {
    switch (health.status) {
      case 'active':
        return 'text-green-600';
      case 'quiet':
        return 'text-yellow-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusIcon = () => {
    switch (health.status) {
      case 'active':
        return <CheckCircle className="h-5 w-5" />;
      case 'quiet':
        return <Clock className="h-5 w-5" />;
      case 'down':
        return <AlertCircle className="h-5 w-5" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    if (!health.lastReceived) return 'No webhooks received yet';

    if (health.minutesSince !== null && health.minutesSince < 60) {
      return `Last call ${health.minutesSince} minute${health.minutesSince !== 1 ? 's' : ''} ago`;
    } else if (health.hoursSince !== null && health.hoursSince < 24) {
      return `Last call ${health.hoursSince} hour${health.hoursSince !== 1 ? 's' : ''} ago`;
    } else if (health.hoursSince !== null) {
      const days = Math.floor(health.hoursSince / 24);
      return `Last call ${days} day${days !== 1 ? 's' : ''} ago`;
    }

    return 'Unknown';
  };

  const formatDate = (date: Date | string) => {
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return dateObj.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-1 ${getStatusColor()}`}>
          {getStatusIcon()}
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>

        {/* Show warning banner if down */}
        {health.status === 'down' && (
          <div className="ml-4 px-3 py-1 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">
              ⚠️ No calls received in 24+ hours - check OpenPhone webhook settings
            </p>
          </div>
        )}

        {/* Show quiet notice */}
        {health.status === 'quiet' && health.hoursSince !== null && health.hoursSince > 4 && (
          <div className="ml-4 px-3 py-1 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-yellow-800">
              Quiet period - last call was {health.hoursSince} hour{health.hoursSince !== 1 ? 's' : ''} ago
            </p>
          </div>
        )}

        {/* View Details button */}
        {health.recentEvents.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails(true)}
            className="text-xs h-7"
          >
            View Details
          </Button>
        )}
      </div>

      {/* Details Modal */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recent Webhook Events</DialogTitle>
            <DialogDescription>
              Last 10 webhook events received from OpenPhone
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {health.recentEvents.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Call ID</TableHead>
                    <TableHead>Received At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {health.recentEvents.map((event, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">
                        {event.eventType || 'N/A'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {event.callId || 'N/A'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(event.receivedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No webhook events recorded yet
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

