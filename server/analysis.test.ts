import { describe, expect, it } from "vitest";
import { analyzeCall } from "./analysis";

describe("Call Analysis", () => {
  it("should analyze a call with transcript", async () => {
    // Use a known callId from seed data that has a transcript
    const testCallId = "AC3700e624eca547eb9f749a06f";
    
    const result = await analyzeCall({ callId: testCallId });
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.callId).toBe(testCallId);
    
    if (result.analysis) {
      expect(result.analysis.summary).toBeDefined();
      expect(result.analysis.summary.length).toBeGreaterThan(0);
      
      expect(["Positive", "Neutral", "Negative"]).toContain(result.analysis.sentiment);
      
      expect(result.analysis.score).toBeGreaterThanOrEqual(0);
      expect(result.analysis.score).toBeLessThanOrEqual(100);
      
      expect(result.analysis.complianceChecks).toBeDefined();
      expect(["Yes", "No", "NA"]).toContain(result.analysis.complianceChecks.greeting);
      expect(["Yes", "No", "NA"]).toContain(result.analysis.complianceChecks.verification);
      expect(["Yes", "No", "NA"]).toContain(result.analysis.complianceChecks.recordingConsent);
      expect(["Yes", "No", "NA"]).toContain(result.analysis.complianceChecks.professionalism);
      
      expect(Array.isArray(result.analysis.keyActionItems)).toBe(true);
      expect(result.analysis.detailedNotes).toBeDefined();
    }
  }, 60000); // 60 second timeout for LLM call

  it("should return error for non-existent call", async () => {
    const result = await analyzeCall({ callId: "NONEXISTENT123" });
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Call not found");
  });

  it("should return error for call without transcript", async () => {
    // Use a call that exists but has no transcript (the missed call)
    const testCallId = "AC3700e624eca547eb9f749a06e";
    
    const result = await analyzeCall({ callId: testCallId });
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
