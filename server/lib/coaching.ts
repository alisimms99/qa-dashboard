import { invokeLLM } from "../_core/llm";
import type { Call } from "../../drizzle/schema";
import type { Transcript } from "../../drizzle/schema";
import type { Analysis } from "../../drizzle/schema";

export interface RubricBreakdown {
  greeting: { score: number; feedback: string };
  professionalism: { score: number; feedback: string };
  problemResolution: { score: number; feedback: string };
  closing: { score: number; feedback: string };
  compliance: { score: number; feedback: string };
}

export interface ImprovementItem {
  issue: string;
  quote: string;
  alternative: string;
}

export interface DetailedCoachingFeedback {
  rubricBreakdown: RubricBreakdown;
  strengths: string[];
  improvements: ImprovementItem[];
  suggestedResponses: string[];
  coachingPoints: string[];
  comparisonToAverage?: {
    teamAvg: number;
    percentile: number;
  };
}

export async function generateDetailedCoaching(
  call: Call,
  transcript: Transcript | null,
  analysis: Analysis | null
): Promise<DetailedCoachingFeedback> {
  if (!transcript || !transcript.fullText) {
    throw new Error("Transcript is required for detailed coaching");
  }

  const prompt = `You are an expert call quality coach for a facilities maintenance company.

Call Details:
- Direction: ${call.direction}
- Duration: ${call.duration}s
- Status: ${call.status}
- Current QA Score: ${analysis?.score || 'N/A'}/100
- From: ${call.fromNumber}
- To: ${call.toNumber}

Full Transcript:
${transcript.fullText}

${analysis?.summary ? `Previous Analysis Summary:\n${analysis.summary}\n` : ''}

Analyze this call and provide detailed coaching feedback in the following format:

1. RUBRIC BREAKDOWN (score 0-100 for each category):
   - greeting: Did they answer professionally with company name? Score and specific feedback.
   - professionalism: Tone, language, courtesy throughout call. Score and specific feedback.
   - problemResolution: How well did they address customer needs? Score and specific feedback.
   - closing: Proper ending, next steps, thank you. Score and specific feedback.
   - compliance: Required disclosures, legal requirements. Score and specific feedback.

2. STRENGTHS (2-3 specific examples with exact quotes from transcript):
   - What did they do well?
   - Which moments were excellent?
   - Include exact quotes from the transcript

3. IMPROVEMENTS (2-3 specific examples with exact quotes):
   - What could be better?
   - Exact moments that need work
   - Include the exact quote from transcript and suggest a better alternative response

4. SUGGESTED ALTERNATIVE RESPONSES:
   - For each improvement area, provide 1-2 better ways to phrase it
   - Make them specific and actionable

5. COACHING TALKING POINTS:
   - 3-5 specific things a manager should discuss with this person
   - Be specific and reference exact moments in the call

Return ONLY valid JSON matching this exact schema:
{
  "rubricBreakdown": {
    "greeting": {"score": 85, "feedback": "..."},
    "professionalism": {"score": 90, "feedback": "..."},
    "problemResolution": {"score": 75, "feedback": "..."},
    "closing": {"score": 80, "feedback": "..."},
    "compliance": {"score": 95, "feedback": "..."}
  },
  "strengths": ["...", "...", "..."],
  "improvements": [
    {"issue": "...", "quote": "...", "alternative": "..."},
    {"issue": "...", "quote": "...", "alternative": "..."}
  ],
  "suggestedResponses": ["...", "..."],
  "coachingPoints": ["...", "...", "..."]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    // Extract content from response
    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      throw new Error("No content in LLM response");
    }
    
    // Handle content which can be string or array
    let content: string;
    if (typeof messageContent === "string") {
      content = messageContent;
    } else if (Array.isArray(messageContent)) {
      // Find text content in array
      const textPart = messageContent.find((part) => part.type === "text");
      if (!textPart || textPart.type !== "text") {
        throw new Error("No text content in LLM response");
      }
      content = textPart.text;
    } else {
      throw new Error("Unexpected content type in LLM response");
    }
    
    if (!content) {
      throw new Error("No text content in LLM response");
    }

    // Parse JSON response
    const parsed = JSON.parse(content) as DetailedCoachingFeedback;

    // Validate structure
    if (!parsed.rubricBreakdown || !parsed.strengths || !parsed.improvements) {
      throw new Error("Invalid response structure from LLM");
    }

    return parsed;
  } catch (error) {
    console.error("[Coaching] Failed to generate detailed coaching:", error);
    throw error;
  }
}

