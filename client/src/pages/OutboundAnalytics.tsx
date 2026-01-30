import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, Phone, Calendar, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';

export default function OutboundAnalytics() {
  const [, setLocation] = useLocation();
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/outbound/analytics?days=30');
      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }
      const data = await response.json();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-8">
          <Button variant="ghost" onClick={() => setLocation("/")} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-destructive">
                {error || 'Failed to load analytics'}
              </p>
              <Button onClick={fetchAnalytics} className="mt-4">
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const breakdownChartData = Object.entries(analytics.breakdownPoints).map(([point, count]) => ({
    point: point.replace(/\s+/g, '\n'), // Add line breaks for long labels
    count,
  }));

  const outcomeChartData = Object.entries(analytics.outcomes).map(([outcome, count]) => ({
    outcome: outcome.replace(/\s+/g, '\n'),
    count,
  }));

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container py-6">
          <Button variant="ghost" onClick={() => setLocation("/")} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Outbound Call Analytics</h1>
              <p className="text-muted-foreground">
                Breakdown points, objections, and conversion metrics
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Phone className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Calls</p>
                  <p className="text-2xl font-bold">{analytics.overview.totalCalls}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Calendar className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Appointments</p>
                  <p className="text-2xl font-bold">{analytics.overview.appointmentsScheduled}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-orange-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Conversion Rate</p>
                  <p className="text-2xl font-bold">{analytics.overview.conversionRate}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Phone className="h-8 w-8 text-purple-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Callbacks</p>
                  <p className="text-2xl font-bold">{analytics.overview.callbacksScheduled}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Call Breakdown Points</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={breakdownChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="point" 
                    angle={-45} 
                    textAnchor="end" 
                    height={100}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Call Outcomes</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={outcomeChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ outcome, count }) => `${outcome}: ${count}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {outcomeChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Top Objections */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Top 10 Objections
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.topObjections.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No objections recorded yet. Make some outbound calls to see objection data.
              </p>
            ) : (
              <div className="space-y-4">
                {analytics.topObjections.map((obj: any, index: number) => (
                  <div key={index} className="border-b pb-3 last:border-b-0">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-semibold">"{obj.objection}"</p>
                      <span className="text-sm text-muted-foreground">
                        {obj.count} times ({obj.percentage}%)
                      </span>
                    </div>
                    {obj.examples && obj.examples.length > 0 && (
                      <div className="ml-4 text-sm space-y-2">
                        <div>
                          <p className="font-medium text-muted-foreground">Example response:</p>
                          <p className="italic">"{obj.examples[0].agentResponse}"</p>
                          <span className={`text-xs px-2 py-1 rounded ${
                            obj.examples[0].quality === 'Excellent' ? 'bg-green-100 text-green-800' :
                            obj.examples[0].quality === 'Good' ? 'bg-blue-100 text-blue-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {obj.examples[0].quality}
                          </span>
                        </div>
                        {obj.examples[0].suggestedResponse && (
                          <div className="mt-2">
                            <p className="font-medium text-green-700">Suggested improvement:</p>
                            <p className="text-green-700">"{obj.examples[0].suggestedResponse}"</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Average Scores by Outcome */}
        <Card>
          <CardHeader>
            <CardTitle>Performance by Outcome</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.avgScoresByOutcome.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No performance data available yet.
              </p>
            ) : (
              <div className="space-y-2">
                {analytics.avgScoresByOutcome.map((item: any, index: number) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="font-medium">{item.outcome}</span>
                    <div className="text-right">
                      <span className="text-lg font-bold text-primary">{item.avgScore}</span>
                      <span className="text-sm text-muted-foreground ml-2">({item.count} calls)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

