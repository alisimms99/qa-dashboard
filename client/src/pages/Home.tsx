import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Phone, PhoneIncoming, PhoneOutgoing, Sparkles, TrendingUp, CheckCircle, BarChart3, FileText, BarChart, Download, Filter, LogOut, User, FileSpreadsheet, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { exportToPDF, exportToDOCX, exportToCSV } from "@/lib/exports";
import { WebhookHealthIndicator } from "@/components/WebhookHealthIndicator";

export default function Home() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  
  // Filter state
  const [dateFilter, setDateFilter] = useState('all');
  const [scoreFilter, setScoreFilter] = useState('all');
  const [phoneLineFilter, setPhoneLineFilter] = useState('all');
  
  // Call-specific analyzing state (BUG 2 FIX)
  const [analyzingCalls, setAnalyzingCalls] = useState<Record<string, boolean>>({});
  
  // Map frontend filter values to backend values
  const getBackendFilters = () => {
    const filters: any = {};
    
    if (dateFilter !== 'all') {
      filters.timeRange = dateFilter === 'today' ? 'today' : dateFilter === 'week' ? 'week' : 'month';
    }
    
    if (scoreFilter !== 'all') {
      filters.scoreRange = scoreFilter;
    }
    
    // Map phone line filter to phoneNumberId
    if (phoneLineFilter !== 'all') {
      const phoneNumberMap: Record<string, string> = {
        'main': process.env.VITE_MAIN_PHONE_NUMBER_ID || 'PNVbbBqeqM',
        'outbound': process.env.VITE_OUTBOUND_PHONE_NUMBER_ID || 'PNBANAZERt',
        'primary': process.env.VITE_PRIMARY_PHONE_NUMBER_ID || '',
      };
      if (phoneNumberMap[phoneLineFilter]) {
        filters.phoneNumberId = phoneNumberMap[phoneLineFilter];
      }
    }
    
    // Always return an object (empty {} if no filters) instead of undefined
    // This prevents tRPC validation errors
    return filters;
  };
  
  const { data: calls, isLoading, error, refetch } = trpc.calls.list.useQuery(getBackendFilters());
  const { data: stats, refetch: refetchStats } = trpc.calls.stats.useQuery(getBackendFilters());

  // Real-time polling: refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
      refetchStats();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [refetch, refetchStats]);

  const analyzeMutation = trpc.analysis.analyzeCall.useMutation({
    onSuccess: async (result, variables) => {
      const callId = variables.callId;
      setAnalyzingCalls(prev => ({ ...prev, [callId]: false }));
      
      if (result.success) {
        toast.success(
          `Analysis complete! QA Score: ${result.analysis?.score}/100`
        );
        // BUG 1 FIX: Wait for refetch to complete to ensure UI updates
        await refetch();
        await refetchStats();
      } else {
        toast.error(`Analysis failed: ${result.error}`);
      }
    },
    onError: (error, variables) => {
      const callId = variables.callId;
      setAnalyzingCalls(prev => ({ ...prev, [callId]: false }));
      toast.error(`Analysis error: ${error.message}`);
    },
  });

  const handleAnalyze = async (callId: string) => {
    // BUG 2 FIX: Set call-specific loading state
    setAnalyzingCalls(prev => ({ ...prev, [callId]: true }));
    try {
      await analyzeMutation.mutateAsync({ callId });
    } catch (error) {
      // Error handling is done in onError callback
      console.error('Analysis failed:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      missed: "destructive",
      canceled: "secondary",
      failed: "destructive",
    };
    return (
      <Badge variant={variants[status] || "outline"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Calculate time-based stats
  const timeBasedStats = useMemo(() => {
    if (!calls) return { today: 0, thisWeek: 0, thisMonth: 0 };
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    return {
      today: calls.filter(c => new Date(c.createdAt) >= today).length,
      thisWeek: calls.filter(c => new Date(c.createdAt) >= weekAgo).length,
      thisMonth: calls.filter(c => new Date(c.createdAt) >= monthAgo).length,
    };
  }, [calls]);

  // Filter calls based on selected filters
  const filteredCalls = useMemo(() => {
    if (!calls) return [];
    
    let filtered = [...calls];

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;
      
      if (dateFilter === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateFilter === 'week') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
      } else if (dateFilter === 'month') {
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
      } else {
        startDate = new Date(0);
      }
      
      filtered = filtered.filter(c => new Date(c.createdAt) >= startDate);
    }

    // Phone line filter (requires analysis data - simplified for now)
    if (phoneLineFilter !== 'all') {
      // This would need analysis data to filter properly
      // For now, we'll filter by direction
      if (phoneLineFilter === 'main') {
        filtered = filtered.filter(c => c.direction === 'incoming');
      } else if (phoneLineFilter === 'outbound') {
        filtered = filtered.filter(c => c.direction === 'outgoing');
      }
    }

    return filtered;
  }, [calls, dateFilter, scoreFilter, phoneLineFilter]);

  // Export functions
  const handleExportPDF = async () => {
    if (!filteredCalls || !stats) {
      toast.error('No data available to export');
      return;
    }

    try {
      await exportToPDF(filteredCalls, stats, {
        dateFilter,
        scoreFilter,
        phoneLineFilter,
      });
      toast.success('PDF exported successfully');
    } catch (error) {
      toast.error('Failed to export PDF');
      console.error('Export error:', error);
    }
  };

  const handleExportDOCX = async () => {
    if (!filteredCalls || !stats) {
      toast.error('No data available to export');
      return;
    }

    try {
      await exportToDOCX(filteredCalls, stats, {
        dateFilter,
        scoreFilter,
        phoneLineFilter,
      });
      toast.success('DOCX exported successfully');
    } catch (error) {
      toast.error('Failed to export DOCX');
      console.error('Export error:', error);
    }
  };

  const handleExportCSV = () => {
    if (!filteredCalls || filteredCalls.length === 0) {
      toast.error('No data available to export');
      return;
    }

    try {
      exportToCSV(filteredCalls);
      toast.success('CSV exported successfully');
    } catch (error) {
      toast.error('Failed to export CSV');
      console.error('Export error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Phone className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  Quality Assurance Dashboard
                </h1>
                <p className="text-muted-foreground">
                  OpenPhone Call Analysis & Compliance Monitoring
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setLocation("/outbound-analytics")}
                className="gap-2"
              >
                <BarChart className="h-4 w-4" />
                Outbound Analytics
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation("/training-manual")}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                Training Manual
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation("/script-optimizer")}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Script Optimizer
              </Button>
              
              {/* User Profile Dropdown */}
              {user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.photoURL || undefined} alt={user.displayName || user.email || "User"} />
                        <AvatarFallback>
                          {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {user.displayName || "User"}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          
          {/* Webhook Health Indicator */}
          <div className="mt-4 pt-4 border-t">
            <WebhookHealthIndicator />
          </div>
        </div>
      </header>

      <main className="container py-8">
        {/* Getting Started Section for First-Time Users */}
        {!isLoading && calls && calls.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center mb-8">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              No calls yet
            </h3>
            <p className="text-blue-700 mb-4">
              The system is ready and waiting for calls. Make a test call to see it in action!
            </p>
            <p className="text-sm text-blue-600">
              Calls will appear here automatically when they complete.
            </p>
          </div>
        )}

        {/* Filters and Export Bar */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Filter className="h-5 w-5 text-muted-foreground" />
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This week</SelectItem>
                  <SelectItem value="month">This month</SelectItem>
                </SelectContent>
              </Select>

              <Select value={scoreFilter} onValueChange={setScoreFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Score" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All scores</SelectItem>
                  <SelectItem value="high">85-100 (Excellent)</SelectItem>
                  <SelectItem value="medium">70-84 (Good)</SelectItem>
                  <SelectItem value="low">0-69 (Needs Improvement)</SelectItem>
                </SelectContent>
              </Select>

              <Select value={phoneLineFilter} onValueChange={setPhoneLineFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Phone line" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All lines</SelectItem>
                  <SelectItem value="main">Main line (incoming)</SelectItem>
                  <SelectItem value="outbound">Outbound line</SelectItem>
                </SelectContent>
              </Select>

              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={handleExportPDF} disabled={!calls || calls.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  Export PDF
                </Button>
                <Button variant="outline" onClick={handleExportDOCX} disabled={!calls || calls.length === 0}>
                  <FileText className="mr-2 h-4 w-4" />
                  Export DOCX
                </Button>
                <Button variant="outline" onClick={handleExportCSV} disabled={!calls || calls.length === 0}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Analyzed</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalAnalyzed || 0}</div>
              <p className="text-xs text-muted-foreground">
                out of {stats?.totalCalls || 0} total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Analyzed Today</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{timeBasedStats.today}</div>
              <p className="text-xs text-muted-foreground">calls today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Week</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{timeBasedStats.thisWeek}</div>
              <p className="text-xs text-muted-foreground">calls this week</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{timeBasedStats.thisMonth}</div>
              <p className="text-xs text-muted-foreground">calls this month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average QA Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.averageScore || 0}/100</div>
              <p className="text-xs text-muted-foreground">
                {(stats?.averageScore || 0) >= 80 ? "Excellent" : (stats?.averageScore || 0) >= 70 ? "Good" : "Needs Improvement"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compliance Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.complianceRate || 0}%</div>
              <p className="text-xs text-muted-foreground">
                {(stats?.complianceRate || 0) >= 90 ? "Meeting standards" : "Review needed"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Call Records Table */}
        <Card>
          <CardHeader>
            <CardTitle>Call Records</CardTitle>
            <CardDescription>
              View and analyze all call records with transcripts and QA scores
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
                Error loading calls: {error.message}
              </div>
            )}


            {filteredCalls && filteredCalls.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Direction</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCalls.map((call) => (
                      <TableRow key={call.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {call.direction === "incoming" ? (
                              <PhoneIncoming className="h-4 w-4 text-green-600" />
                            ) : (
                              <PhoneOutgoing className="h-4 w-4 text-blue-600" />
                            )}
                            <span className="capitalize">{call.direction}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{call.fromNumber}</TableCell>
                        <TableCell className="font-mono text-sm">{call.toNumber}</TableCell>
                        <TableCell>{formatDuration(call.duration)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(call.status)}
                            {(call as any).score !== null && (call as any).score !== undefined && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                ✓ Analyzed ({(call as any).score}/100)
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(call.createdAt)}</TableCell>
                        <TableCell className="text-right">
                      <div className="flex gap-2">
                        <Button
                          variant={(call as any).score !== null && (call as any).score !== undefined ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleAnalyze(call.callId)}
                          disabled={analyzingCalls[call.callId] || false}
                          className={`gap-1 ${
                            (call as any).score !== null && (call as any).score !== undefined
                              ? "bg-blue-600 hover:bg-blue-700 text-white"
                              : ""
                          }`}
                        >
                          {analyzingCalls[call.callId] ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Analyzing...
                            </>
                          ) : (call as any).score !== null && (call as any).score !== undefined ? (
                            <>
                              <RefreshCw className="h-3 w-3" />
                              Re-analyze
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3" />
                              Analyze
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/calls/${call.callId}`)}
                        >
                          View Details
                        </Button>
                      </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : calls && calls.length > 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No calls match the selected filters.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
