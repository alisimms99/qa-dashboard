/**
 * Inbound Call QA Criteria
 * Focus: Extract best practices for training new receptionists
 */

export function buildInboundQAPrompt(transcriptText: string): string {
  // CRITICAL: Check for corrupted transcript data
  if (!transcriptText || 
      transcriptText.trim().length === 0 || 
      transcriptText.includes('undefined: undefined')) {
    throw new Error('Cannot analyze corrupted or empty transcript');
  }

  return `You are a Quality Assurance analyst for Odd Jobs Property Maintenance, a facilities maintenance company in Pittsburgh. Analyze this INBOUND call to extract best practices for training new receptionists.

**IMPORTANT:** If the transcript contains "undefined" or appears corrupted, respond with: "Transcript unavailable - cannot analyze"

**Call Transcript:**

${transcriptText}

**Analysis Criteria:**

A. **Professional Greeting (0-15 points)**
   - Did agent answer with company name clearly?
   - Expected: "Thank you for calling Odd Jobs Property Maintenance" or similar
   - Tone: Professional, friendly, welcoming
   - Speed: Not rushed, clear enunciation

B. **Needs Assessment (0-25 points)**
   - Did agent ask clarifying questions about the issue?
   - Did they gather: Location, type of issue, urgency level?
   - Did they demonstrate active listening (acknowledged concerns)?
   - Did they avoid making assumptions?

C. **Problem-Solving Approach (0-25 points)**
   - Did agent demonstrate knowledge of services?
   - Did they set appropriate expectations (timeline, process)?
   - Did they offer solutions or next steps?
   - Did they handle emergencies with appropriate urgency?

D. **Scheduling & Follow-up (0-20 points)**
   - Did agent attempt to schedule service or callback?
   - Did they confirm contact information?
   - Did they provide clear next steps?
   - Did they set callback expectations if issue couldn't be resolved immediately?

E. **Empathy & De-escalation (0-15 points)**
   - For frustrated/upset callers: Did agent show empathy?
   - Did they use calming language?
   - Did they avoid defensive responses?
   - Did they take ownership even if not their fault?

**Extract Best Practices:**

For each criterion above, identify:
1. **Specific phrases that worked well** (exact quotes from transcript)
2. **Techniques used** (e.g., "repeated back caller's concern", "used caller's name")
3. **Moments of excellence** (specific timestamps where agent excelled)
4. **Areas for improvement** (what could have been better)

**Response Format (JSON):**

{
  "score": 0-100,
  "sentiment": "Positive" | "Neutral" | "Negative",
  "summary": "2-sentence summary of call",
  "complianceChecks": {
    "greeting": {
      "compliant": true/false,
      "notes": "Specific feedback",
      "examplePhrase": "Exact quote from transcript"
    },
    "needsAssessment": {
      "compliant": true/false,
      "notes": "Specific feedback",
      "questionsAsked": ["list of questions agent asked"]
    },
    "problemSolving": {
      "compliant": true/false,
      "notes": "Specific feedback",
      "solutionsOffered": ["list of solutions"]
    },
    "scheduling": {
      "compliant": true/false,
      "notes": "Specific feedback",
      "appointmentScheduled": true/false
    },
    "empathy": {
      "compliant": true/false,
      "notes": "Specific feedback",
      "empathyPhrases": ["exact empathy phrases used"]
    }
  },
  "bestPractices": [
    "Specific practice that worked well (with timestamp if possible)"
  ],
  "areasForImprovement": [
    "Specific area that could be better"
  ],
  "trainingRecommendations": [
    "Specific training module or technique to address improvement areas"
  ],
  "keyMoments": [
    {
      "timestamp": "approximate time in call",
      "description": "what happened",
      "category": "Excellence" | "Improvement Opportunity"
    }
  ]
}`;
}

