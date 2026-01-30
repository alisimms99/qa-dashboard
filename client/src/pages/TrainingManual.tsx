import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, FileText, Loader2, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

export default function TrainingManual() {
  const [, setLocation] = useLocation();
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const generateManual = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/training-manual/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minScore: 85,
          maxCalls: 50,
          includeAdvanced: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate manual');
      }

      const data = await response.json();
      setResult(data);
      toast.success('Training manual generated successfully!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      toast.error(`Failed to generate manual: ${errorMessage}`);
    } finally {
      setGenerating(false);
    }
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
            <FileText className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Training Manual Generator</h1>
              <p className="text-muted-foreground">
                Generate a comprehensive SOP manual from high-scoring inbound calls
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Generate Training Manual</CardTitle>
            <CardDescription>
              Analyze high-scoring calls to create Standard Operating Procedures for new hires
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">How it works:</h3>
                <ul className="list-disc ml-5 space-y-2 text-sm text-muted-foreground">
                  <li>Analyzes your highest-scoring inbound calls (85+ score)</li>
                  <li>Extracts best practices, phrases, and techniques</li>
                  <li>Identifies common mistakes from low-scoring calls</li>
                  <li>Generates a complete training manual with role-play scenarios</li>
                  <li>Includes both basic SOP and advanced techniques</li>
                </ul>
              </div>

              <Button 
                onClick={generateManual} 
                disabled={generating}
                className="w-full"
                size="lg"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Training Manual...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Generate Training Manual
                  </>
                )}
              </Button>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
                  <h4 className="font-semibold mb-1">Error</h4>
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {result && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    ✓ Training Manual Generated!
                  </h3>
                  <div className="text-sm text-green-800 space-y-2 mb-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="font-medium">High-scoring calls analyzed:</span>{' '}
                        {result.stats.highScoringCallsAnalyzed}
                      </div>
                      <div>
                        <span className="font-medium">Low-scoring calls analyzed:</span>{' '}
                        {result.stats.lowScoringCallsAnalyzed}
                      </div>
                      <div>
                        <span className="font-medium">Minimum score threshold:</span>{' '}
                        {result.stats.minScoreThreshold}
                      </div>
                      <div>
                        <span className="font-medium">File:</span> {result.filename}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <a 
                      href={`/training-materials/${result.filename}`}
                      download={result.filename}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-md hover:bg-green-800 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Download Training Manual
                    </a>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const blob = new Blob([result.content], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = result.filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download as Markdown
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

