import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  ArrowLeft,
  Lightbulb,
  AlertTriangle,
  TrendingDown,
} from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Streamdown } from "streamdown";

export default function ScriptOptimizer() {
  const [, setLocation] = useLocation();
  const [improvements, setImprovements] = useState<string | null>(null);

  const optimizeMutation = trpc.scriptOptimizer.generateImprovements.useMutation({
    onSuccess: (result) => {
      if (result.success && result.improvements) {
        setImprovements(typeof result.improvements === 'string' ? result.improvements : JSON.stringify(result.improvements));
      }
    },
  });

  const handleGenerateImprovements = () => {
    setImprovements(null);
    optimizeMutation.mutate({ scoreThreshold: 70 });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container py-6">
          <Button variant="ghost" onClick={() => setLocation("/")} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="flex items-center gap-3">
            <Lightbulb className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Script Optimizer</h1>
              <p className="text-muted-foreground">
                Analyze failed calls and generate script improvements
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="grid gap-6">
          {/* Overview Card */}
          <Card>
            <CardHeader>
              <CardTitle>How It Works</CardTitle>
              <CardDescription>
                This tool analyzes calls with negative sentiment or low QA scores to identify
                common issues and suggest specific improvements to your calling scripts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3 rounded-lg bg-muted p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Analysis Criteria</p>
                  <p className="text-sm text-muted-foreground">
                    Calls with <strong>Negative sentiment</strong> or{" "}
                    <strong>QA scores below 70</strong> are analyzed to generate
                    recommendations.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Generate Button */}
          <Card>
            <CardHeader>
              <CardTitle>Generate Script Improvements</CardTitle>
              <CardDescription>
                Click below to analyze failed calls and receive AI-powered script recommendations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleGenerateImprovements}
                disabled={optimizeMutation.isPending}
                size="lg"
                className="w-full gap-2"
              >
                {optimizeMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Analyzing Failed Calls...
                  </>
                ) : (
                  <>
                    <Lightbulb className="h-5 w-5" />
                    Generate Improvements
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Error Display */}
          {optimizeMutation.isError && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-destructive">
                  Error: {optimizeMutation.error.message}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Results Display */}
          {improvements && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  <CardTitle>Recommended Script Improvements</CardTitle>
                </div>
                <CardDescription>
                  Based on analysis of failed calls, here are specific improvements to handle
                  common objections and issues better
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <Streamdown>{improvements}</Streamdown>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Failed Calls Preview */}
          {optimizeMutation.data?.failedCallsCount !== undefined && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  <CardTitle>Analysis Summary</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg bg-muted p-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Failed Calls Analyzed
                      </p>
                      <p className="text-2xl font-bold">
                        {optimizeMutation.data.failedCallsCount}
                      </p>
                    </div>
                    <Badge variant="destructive" className="text-lg">
                      Needs Improvement
                    </Badge>
                  </div>

                  {optimizeMutation.data.failedCalls && optimizeMutation.data.failedCalls.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="mb-3 font-semibold">Recent Failed Calls</h4>
                        <div className="space-y-2">
                          {optimizeMutation.data.failedCalls.slice(0, 5).map((call: any) => (
                            <div
                              key={call.callId}
                              className="flex items-center justify-between rounded-lg border p-3"
                            >
                              <div className="flex-1">
                                <p className="text-sm font-medium">
                                  {call.direction === "incoming" ? "Incoming" : "Outgoing"} Call
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(call.createdAt)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{call.score}/100</Badge>
                                <Badge
                                  variant={
                                    call.sentiment === "Negative"
                                      ? "destructive"
                                      : "secondary"
                                  }
                                >
                                  {call.sentiment}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
