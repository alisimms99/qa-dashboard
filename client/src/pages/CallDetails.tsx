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
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  ArrowLeft,
  Phone,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  TrendingUp,
  MessageSquare,
  User,
} from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export default function CallDetails() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/calls/:callId");
  const callId = params?.callId || "";
  const { user } = useAuth();
  const [coachingNote, setCoachingNote] = useState("");

  const { data, isLoading, error, refetch } = trpc.calls.getDetailedAnalysis.useQuery(
    { callId },
    {
      enabled: !!callId,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      staleTime: 0, // Don't use cached data - always fetch fresh
      gcTime: 0, // Don't cache results (gcTime replaces cacheTime in newer React Query)
    }
  );

  const addNoteMutation = trpc.calls.addCoachingNote.useMutation({
    onSuccess: () => {
      toast.success("Coaching note added successfully");
      setCoachingNote("");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to add note: ${error.message}`);
    },
  });

  const handleAddNote = () => {
    if (!coachingNote.trim()) {
      toast.error("Please enter a note");
      return;
    }
    addNoteMutation.mutate({ callId, notes: coachingNote });
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (typeof seconds !== "number" || isNaN(seconds)) {
      return "0:00";
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Date not available";
    try {
      const dateObj = typeof date === "string" ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return "Invalid date";
      return dateObj.toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Invalid date";
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data || !data.call) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-8">
          <Button variant="ghost" onClick={() => setLocation("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Calls
          </Button>
          <Card className="mt-4">
            <CardContent className="py-12 text-center">
              <p className="text-destructive">
                {error ? `Error: ${error.message || "Unknown error"}` : "Call not found"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { call, transcript, analysis, coachingNotes } = data;

  // Enhanced debug logging for transcript
  if (transcript) {
    console.log('[CallDetails] ===== TRANSCRIPT DEBUG =====');
    console.log('[CallDetails] Full transcript object:', JSON.stringify(transcript, null, 2));
    console.log('[CallDetails] Has fullText?', !!transcript.fullText);
    console.log('[CallDetails] fullText preview:', transcript.fullText?.substring(0, 200) || 'N/A');
    console.log('[CallDetails] fullText length:', transcript.fullText?.length || 0);
    console.log('[CallDetails] Has jsonPayload?', !!transcript.jsonPayload);
    console.log('[CallDetails] jsonPayload type:', typeof transcript.jsonPayload);
    console.log('[CallDetails] jsonPayload raw:', transcript.jsonPayload);
    
    if (transcript.jsonPayload) {
      try {
        const parsed = typeof transcript.jsonPayload === 'string' 
          ? JSON.parse(transcript.jsonPayload) 
          : transcript.jsonPayload;
        console.log('[CallDetails] Parsed jsonPayload:', parsed);
        console.log('[CallDetails] Parsed type:', typeof parsed);
        console.log('[CallDetails] Has segments?', !!parsed?.segments);
        console.log('[CallDetails] Segments type:', Array.isArray(parsed?.segments) ? 'array' : typeof parsed?.segments);
        console.log('[CallDetails] Segments count:', parsed?.segments?.length || 0);
        if (parsed?.segments && parsed.segments.length > 0) {
          console.log('[CallDetails] First segment:', parsed.segments[0]);
        }
      } catch (e) {
        console.error('[CallDetails] Failed to parse jsonPayload:', e);
        console.error('[CallDetails] Error details:', e);
      }
    }
    console.log('[CallDetails] ===========================');
  } else {
    console.log('[CallDetails] ❌ No transcript object in data');
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container py-6">
          <Button variant="ghost" onClick={() => setLocation("/")} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Calls
          </Button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Phone className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Call Analysis & Coaching</h1>
                <p className="text-muted-foreground">Detailed breakdown and coaching feedback</p>
              </div>
            </div>
            {analysis && (
              <div className="text-right">
                <div className="text-4xl font-bold text-primary">{analysis.score}/100</div>
                <div className="text-sm text-muted-foreground">QA Score</div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-6xl mx-auto">
        <div className="space-y-6">
          {/* Call Header */}
          <Card>
            <CardHeader>
              <CardTitle>Call Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Direction</p>
                    <p className="text-base capitalize">{call.direction}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">From</p>
                    <p className="font-mono text-base">{call.fromNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">To</p>
                    <p className="font-mono text-base">{call.toNumber}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Duration</p>
                    <p className="text-base">{formatDuration(call.duration ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Date</p>
                    <p className="text-base">{formatDate(call.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    <Badge variant="outline" className="capitalize">{call.status}</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rubric Breakdown */}
          {analysis?.rubricBreakdown && (
            <Card>
              <CardHeader>
                <CardTitle>Score Breakdown</CardTitle>
                <CardDescription>Detailed scoring by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {Object.entries(analysis.rubricBreakdown).map(([key, value]: [string, any]) => (
                    <div key={key}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium capitalize">
                          {key.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                        <span className="text-lg font-semibold">{value.score}/100</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                        <div
                          className={`h-3 rounded-full transition-all ${
                            value.score >= 85
                              ? "bg-green-600"
                              : value.score >= 70
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${value.score}%` }}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">{value.feedback}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Strengths */}
          {analysis?.strengths && analysis.strengths.length > 0 && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-800 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {analysis.strengths.map((strength: string, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-green-900">{strength}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Areas for Improvement */}
          {analysis?.improvements && analysis.improvements.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <CardTitle className="text-amber-800 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Areas for Improvement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analysis.improvements.map((item: any, i: number) => (
                    <div key={i} className="pb-4 border-b border-amber-200 last:border-0">
                      <p className="font-medium text-amber-900 mb-2">{item.issue}</p>
                      {item.quote && (
                        <div className="bg-white rounded p-3 mb-2">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Quote:</p>
                          <p className="text-sm italic text-gray-700">"{item.quote}"</p>
                        </div>
                      )}
                      {item.alternative && (
                        <div className="bg-green-50 rounded p-3">
                          <p className="text-xs font-medium text-green-700 mb-1">Better approach:</p>
                          <p className="text-sm text-green-800">{item.alternative}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Suggested Responses */}
          {analysis?.suggestedResponses && analysis.suggestedResponses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Suggested Alternative Responses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.suggestedResponses.map((response: string, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <MessageSquare className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                      <span className="text-sm">{response}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Coaching Points */}
          {analysis?.coachingPoints && analysis.coachingPoints.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Coaching Talking Points
                </CardTitle>
                <CardDescription>Key points to discuss with this team member</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.coachingPoints.map((point: string, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span className="text-sm">{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Team Comparison */}
          {analysis?.comparisonToAverage && (
            <Card>
              <CardHeader>
                <CardTitle>Team Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Team Average</p>
                    <p className="text-2xl font-bold">{analysis.comparisonToAverage.teamAvg}/100</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Percentile</p>
                    <p className="text-2xl font-bold">{analysis.comparisonToAverage.percentile}th</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Full Transcript */}
          {transcript ? (
            <Card>
              <CardHeader>
                <CardTitle>Full Transcript</CardTitle>
                <CardDescription>Complete conversation with speaker labels</CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Parse jsonPayload if it's a string (MySQL JSON fields are often returned as strings)
                  let parsedPayload = transcript.jsonPayload;
                  if (typeof transcript.jsonPayload === 'string') {
                    try {
                      parsedPayload = JSON.parse(transcript.jsonPayload);
                    } catch (e) {
                      console.error('[CallDetails] Failed to parse jsonPayload:', e);
                      parsedPayload = null;
                    }
                  }

                  // Check for segments
                  const segments = parsedPayload?.segments;
                  
                  // Validate segments have speaker and text
                  const validSegments = Array.isArray(segments) 
                    ? segments.filter((s: any) => s.speaker && s.text && s.text.trim())
                    : [];

                  console.log('[CallDetails] Transcript debug:', {
                    hasPayload: !!parsedPayload,
                    hasSegments: !!segments,
                    segmentCount: segments?.length,
                    validSegmentCount: validSegments.length,
                    firstSegment: validSegments[0],
                    fullTextLength: transcript.fullText?.length,
                    fullTextPreview: transcript.fullText?.substring(0, 100),
                  });

                  if (validSegments.length > 0) {
                    return (
                      <div className="space-y-4">
                        {validSegments.map((segment: any, index: number) => (
                          <div key={index} className="flex gap-4">
                            <div className="flex-shrink-0">
                              <Badge variant="outline" className="font-mono text-xs">
                                {segment.start ? Math.floor(segment.start) : index}s
                              </Badge>
                            </div>
                            <div className="flex-1">
                              <p className="mb-1 text-sm font-semibold capitalize flex items-center gap-2">
                                <User className="h-3 w-3" />
                                {segment.speaker || "Unknown"}
                              </p>
                              <p className="text-foreground whitespace-pre-wrap">{segment.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }

                  // Fallback to fullText
                  if (transcript.fullText && !transcript.fullText.includes('undefined: undefined')) {
                    const cleanText = transcript.fullText
                      .replace(/undefined: undefined\n?/g, '')
                      .trim();
                    
                    if (cleanText) {
                      return (
                        <div className="bg-gray-100 rounded p-4">
                          <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans">
                            {cleanText}
                          </pre>
                        </div>
                      );
                    }
                  }

                  // No valid transcript
                  return (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                      <p className="text-yellow-800 font-medium">
                        Transcript content not available
                      </p>
                      <p className="text-sm text-yellow-600 mt-1">
                        No readable transcript found for this call.
                      </p>
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-yellow-700">Debug Info</summary>
                        <pre className="mt-2 p-2 bg-yellow-100 rounded text-xs overflow-auto max-h-40">
                          {JSON.stringify(transcript, null, 2)}
                        </pre>
                      </details>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800 font-semibold">Transcript not available</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    This call may not have a transcript yet, or it was handled by Sona AI.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Coaching Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Coaching Notes</CardTitle>
              <CardDescription>Manager feedback and coaching comments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {coachingNotes && coachingNotes.length > 0 ? (
                  <div className="space-y-4">
                    {coachingNotes.map((note: any) => (
                      <div key={note.id} className="border-l-4 border-blue-500 pl-4 py-2 bg-blue-50 rounded-r">
                        <p className="text-sm text-gray-900">{note.notes}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {note.coachUserEmail} - {formatDate(note.coachedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No coaching notes yet.</p>
                )}

                <Separator />

                <div className="space-y-2">
                  <Textarea
                    placeholder="Add coaching notes for this call..."
                    rows={4}
                    value={coachingNote}
                    onChange={(e) => setCoachingNote(e.target.value)}
                    className="resize-none"
                  />
                  <Button
                    onClick={handleAddNote}
                    disabled={addNoteMutation.isPending || !coachingNote.trim()}
                    className="w-full"
                  >
                    {addNoteMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Save Coaching Note
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
