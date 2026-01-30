/**
 * Outbound Call QA Criteria
 * Focus: Breakdown analysis, objection tracking, and script adherence
 */

export function buildOutboundQAPrompt(transcriptText: string): string {
  // CRITICAL: Check for corrupted transcript data
  if (!transcriptText || 
      transcriptText.trim().length === 0 || 
      transcriptText.includes('undefined: undefined')) {
    throw new Error('Cannot analyze corrupted or empty transcript');
  }

  return `You are analyzing an OUTBOUND COLD CALL for Odd Jobs Property Maintenance.

**IMPORTANT:** If the transcript contains "undefined" or appears corrupted, respond with: "Transcript unavailable - cannot analyze"

**Current Cold Call Script:**

Intro:
"Hi, this is Joy with Odd Jobs Property Maintenance in Pittsburgh. Am I speaking with the person who handles repairs or maintenance there?"
"Do you have a quick minute, or should I call back another time?"

Pitch:
"We're expanding our services in the area and wanted to introduce ourselves. Do you currently have someone handling your repairs and maintenance?"
If no: "Perfect—we'd love to be your on-call handymen for small or urgent jobs."
If yes: "Great. We often work as a reliable backup when your main guy's unavailable or overloaded."

Close:
"Would you be open to trying us out on a small job? Do you mind if I send over our info and follow up next week?"

**Call Transcript:**

${transcriptText}

**Analysis Goals:**

1. Identify where call succeeded or broke down
2. Track objections and how they were handled
3. Measure script adherence
4. Identify pain points mentioned by prospect

**Analysis Criteria:**

A. **Script Adherence (0-20 points)**
   - Did agent follow the script structure?
   - Proper introduction with company name?
   - Asked permission to continue ("Do you have a minute?")?
   - Delivered value proposition?
   - Made clear call-to-action?

B. **Gatekeeper Handling (if applicable)**
   - Did agent reach decision maker?
   - If blocked: How did they respond?
   - Did they get decision maker's name/info?

C. **Objection Handling (0-30 points)**
   - "We already have a vendor" → Response quality
   - "Not interested" → Did agent probe for why?
   - "Send me info" → Did agent try to schedule follow-up?
   - "Too expensive/What's your price?" → Response quality
   - Price objection timing: Before or after value delivery?

D. **Call Breakdown Analysis:**
   Identify the exact point where the call failed (if it did):
   - Gatekeeper (never reached decision maker)
   - Introduction phase (hung up during intro)
   - Permission phase (refused to give time)
   - Value proposition phase (not interested in service)
   - Close/CTA phase (refused appointment/info)
   - Success (appointment/callback scheduled)

E. **Pain Point Identification:**
   - Did prospect mention current maintenance issues?
   - Did they express dissatisfaction with current vendor?
   - Did they show interest in specific services?
   - What problems did they hint at?

F. **Outcome Tracking:**
   - Was appointment scheduled? (YES/NO + details)
   - Was callback scheduled? (YES/NO + when)
   - Did prospect request info? (YES/NO + email)
   - Hard rejection? (YES/NO + reason)

**Response Format (JSON):**

{
  "score": 0-100,
  "outcome": "Appointment" | "Callback Scheduled" | "Send Info" | "Not Interested" | "Gatekeeper Block" | "Voicemail",
  "breakdownPoint": "Gatekeeper" | "Introduction" | "Permission" | "Value Prop" | "Close" | "N/A - Success",
  "scriptAdherence": {
    "score": 0-20,
    "deviations": ["list specific deviations from script"],
    "improvements": ["what went well vs script"]
  },
  "objections": [
    {
      "objection": "exact objection from prospect",
      "agentResponse": "how agent handled it",
      "quality": "Excellent" | "Good" | "Poor",
      "suggestedResponse": "better response if applicable"
    }
  ],
  "painPoints": [
    "specific pain points mentioned by prospect"
  ],
  "appointmentScheduled": true/false,
  "callbackScheduled": true/false,
  "infoRequested": true/false,
  "prospectEmail": "email if collected",
  "coachingNotes": "Specific, actionable feedback for improvement",
  "whatWorked": [
    "specific things agent did well"
  ],
  "whatToImprove": [
    "specific things to improve with examples"
  ]
}`;
}

