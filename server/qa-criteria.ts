/**
 * QA Criteria and Analysis System
 * Based on Strategic Quo Setup Guide for Facilities Maintenance Provider
 */

export interface QAAnalysisResult {
  summary: string;
  sentiment: "Positive" | "Neutral" | "Negative";
  complianceChecks: {
    greeting: "Yes" | "No" | "NA";
    verification: "Yes" | "No" | "NA";
    recordingConsent: "Yes" | "No" | "NA";
    professionalism: "Yes" | "No" | "NA";
  };
  keyActionItems: string[];
  score: number; // 0-100
  detailedNotes: string;
  // Outbound call specific fields (only present for outgoing calls)
  painPointIdentification?: {
    strength: "Strong" | "Moderate" | "Weak" | "None";
    notes: string;
  };
  objectionHandling?: {
    rating: "Effective" | "Attempted" | "Poor" | "No objections";
    objections: string[];
    response: string;
  };
  callToAction?: {
    attempted: boolean;
    result: string;
    notes: string;
  };
}

/**
 * Generate the QA analysis prompt based on call direction and transcript
 */
export function buildQAPrompt(transcriptText: string, callDirection: "incoming" | "outgoing"): string {
  return `You are a Quality Assurance analyst for a facilities maintenance company. Analyze the following call transcript and provide a structured assessment.

**Call Direction:** ${callDirection}

**Call Transcript:**
${transcriptText}

**Analysis Guidelines:**

Based on the Strategic Quo Setup Guide for this facilities maintenance provider, evaluate the call against these criteria:

1. **Standard Greeting (During Hours):**
   - Expected greeting: "Thank you for calling [Company Name]"
   - For incoming calls: Did the agent use a professional greeting that identifies the company?
   - For outgoing calls: Did the agent introduce themselves and the company clearly?

2. **Identity Verification:**
   - Did the agent verify they were speaking with the correct person/client?
   - Did they confirm the service address or account details when appropriate?

3. **Recording Consent (Outbound Calls Only):**
   - For outbound calls: Did the agent mention that "this call may be recorded for quality and training purposes"?
   - This is required for compliance per Section 4.3 of the guide.
   - For incoming calls: Mark as "NA" (consent is typically provided in the IVR menu)

4. **Professionalism:**
   - Was the agent polite, clear, and professional throughout?
   - Did they actively listen and address the client's concerns?
   - Was technical jargon explained when necessary?
   - Did they maintain a helpful and solution-oriented tone?

5. **Key Action Items:**
   - Extract any follow-up tasks, commitments, or next steps mentioned
   - Include scheduled appointments, callbacks, or service requests

${callDirection === "outgoing" ? `**Additional Outbound Call Criteria:**

6. **Pain Point Identification:**
   - Did the agent uncover a specific business pain point or maintenance need?
   - Examples: facility issues, recurring problems, compliance concerns
   - Rate: Strong/Moderate/Weak/None

7. **Objection Handling:**
   - What objections did the prospect raise? (e.g., 'already have a vendor', 'not interested', 'too busy')
   - How did the agent respond to objections?
   - Rate: Effective/Attempted/Poor/No objections encountered

8. **Call-to-Action:**
   - Did the agent attempt to schedule an appointment or site visit?
   - Did the agent propose a specific next step with timeline?
   - Result: Appointment set/Follow-up scheduled/Attempted but declined/Not attempted` : ""}

**Response Format:**

Provide your analysis in the following JSON format:

{
  "summary": "A 2-sentence summary of the call covering the main topic and outcome",
  "sentiment": "Positive" | "Neutral" | "Negative",
  "complianceChecks": {
    "greeting": "Yes" | "No" | "NA",
    "verification": "Yes" | "No" | "NA",
    "recordingConsent": "Yes" | "No" | "NA",
    "professionalism": "Yes" | "No" | "NA"
  },
  "keyActionItems": ["action 1", "action 2", ...],
  "score": <number 0-100>,
  "detailedNotes": "Additional observations, coaching opportunities, or notable positive behaviors"${callDirection === "outgoing" ? `,
  "painPointIdentification": {
    "strength": "Strong" | "Moderate" | "Weak" | "None",
    "notes": "Description of pain points identified or lack thereof"
  },
  "objectionHandling": {
    "rating": "Effective" | "Attempted" | "Poor" | "No objections",
    "objections": ["objection 1", "objection 2", ...],
    "response": "Description of how objections were handled"
  },
  "callToAction": {
    "attempted": true | false,
    "result": "Appointment set" | "Follow-up scheduled" | "Attempted but declined" | "Not attempted",
    "notes": "Details about the call-to-action outcome"
  }` : ""}
}

**Scoring Guidelines:**
- Start with 100 points
- Deduct 15 points for each "No" in compliance checks
- Deduct 10 points for "Negative" sentiment
- Deduct 5 points for "Neutral" sentiment with unresolved issues
- Add 5 bonus points for exceptional professionalism or problem-solving${callDirection === "outgoing" ? `
- For outbound calls: Add 10 bonus points if pain point identified (Strong), add 5 if Moderate
- For outbound calls: Add 10 bonus points if call-to-action resulted in appointment/follow-up
- For outbound calls: Deduct 5 points if objections were encountered but poorly handled` : ""}

Provide ONLY the JSON response, no additional text.`;
}

/**
 * Validate QA analysis result structure
 */
export function validateQAResult(result: any): result is QAAnalysisResult {
  if (!result || typeof result !== "object") return false;
  
  if (typeof result.summary !== "string") return false;
  if (!["Positive", "Neutral", "Negative"].includes(result.sentiment)) return false;
  
  if (!result.complianceChecks || typeof result.complianceChecks !== "object") return false;
  const checks = result.complianceChecks;
  const validValues = ["Yes", "No", "NA"];
  if (!validValues.includes(checks.greeting)) return false;
  if (!validValues.includes(checks.verification)) return false;
  if (!validValues.includes(checks.recordingConsent)) return false;
  if (!validValues.includes(checks.professionalism)) return false;
  
  if (!Array.isArray(result.keyActionItems)) return false;
  if (typeof result.score !== "number" || result.score < 0 || result.score > 100) return false;
  if (typeof result.detailedNotes !== "string") return false;
  
  // Validate optional outbound-specific fields if present
  if (result.painPointIdentification !== undefined) {
    if (!result.painPointIdentification || typeof result.painPointIdentification !== "object") return false;
    if (!["Strong", "Moderate", "Weak", "None"].includes(result.painPointIdentification.strength)) return false;
    if (typeof result.painPointIdentification.notes !== "string") return false;
  }
  
  if (result.objectionHandling !== undefined) {
    if (!result.objectionHandling || typeof result.objectionHandling !== "object") return false;
    if (!["Effective", "Attempted", "Poor", "No objections"].includes(result.objectionHandling.rating)) return false;
    if (!Array.isArray(result.objectionHandling.objections)) return false;
    if (typeof result.objectionHandling.response !== "string") return false;
  }
  
  if (result.callToAction !== undefined) {
    if (!result.callToAction || typeof result.callToAction !== "object") return false;
    if (typeof result.callToAction.attempted !== "boolean") return false;
    if (typeof result.callToAction.result !== "string") return false;
    if (typeof result.callToAction.notes !== "string") return false;
  }
  
  return true;
}
