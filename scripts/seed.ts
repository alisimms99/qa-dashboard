import { drizzle } from "drizzle-orm/mysql2";
import { calls, transcripts, analyses } from "../drizzle/schema";

const db = drizzle(process.env.DATABASE_URL!);

const sampleCalls = [
  {
    callId: "AC3700e624eca547eb9f749a06f",
    direction: "incoming" as const,
    fromNumber: "+15551234567",
    toNumber: "+15559876543",
    duration: 245,
    status: "completed",
    createdAt: new Date("2024-11-20T10:30:00Z"),
    answeredAt: new Date("2024-11-20T10:30:05Z"),
    completedAt: new Date("2024-11-20T10:34:10Z"),
    phoneNumberId: "PN123abc",
    userId: "US456def",
    metadata: {
      callRoute: "direct",
      participants: ["+15551234567", "+15559876543"]
    }
  },
  {
    callId: "AC4801f735fdb658fc0a85b17g",
    direction: "outgoing" as const,
    fromNumber: "+15559876543",
    toNumber: "+15552223333",
    duration: 180,
    status: "completed",
    createdAt: new Date("2024-11-21T14:15:00Z"),
    answeredAt: new Date("2024-11-21T14:15:03Z"),
    completedAt: new Date("2024-11-21T14:18:03Z"),
    phoneNumberId: "PN123abc",
    userId: "US456def",
    metadata: {
      callRoute: "direct",
      participants: ["+15559876543", "+15552223333"]
    }
  },
  {
    callId: "AC5902g846gec769gd1b96c28h",
    direction: "incoming" as const,
    fromNumber: "+15554445555",
    toNumber: "+15559876543",
    duration: 0,
    status: "missed",
    createdAt: new Date("2024-11-22T09:45:00Z"),
    answeredAt: null,
    completedAt: null,
    phoneNumberId: "PN123abc",
    userId: "US456def",
    metadata: {
      callRoute: "phone_menu",
      participants: ["+15554445555", "+15559876543"]
    }
  },
  {
    callId: "AC6003h957hfd870he2c07d39i",
    direction: "incoming" as const,
    fromNumber: "+15556667777",
    toNumber: "+15559876543",
    duration: 320,
    status: "completed",
    createdAt: new Date("2024-11-23T16:20:00Z"),
    answeredAt: new Date("2024-11-23T16:20:08Z"),
    completedAt: new Date("2024-11-23T16:25:28Z"),
    phoneNumberId: "PN123abc",
    userId: "US456def",
    metadata: {
      callRoute: "direct",
      participants: ["+15556667777", "+15559876543"]
    }
  }
];

const sampleTranscripts = [
  {
    callId: "AC3700e624eca547eb9f749a06f",
    fullText: "Agent: Good morning, thank you for calling StrategicQuo Facilities Maintenance. My name is Sarah, how may I help you today? Customer: Hi Sarah, I'm calling about a maintenance issue at our office building. We have a leaking pipe in the second-floor restroom. Agent: I'm sorry to hear that. Let me get some information to help you right away. Can I have your company name and address? Customer: Sure, it's TechCorp Solutions at 123 Business Park Drive. Agent: Thank you. I've created a work order for you. Our technician will be there within 2 hours. Is there anything else I can help you with? Customer: No, that's all. Thank you for your quick response. Agent: You're welcome! Have a great day.",
    jsonPayload: {
      segments: [
        { start: 0, end: 15, speaker: "agent", text: "Good morning, thank you for calling StrategicQuo Facilities Maintenance. My name is Sarah, how may I help you today?" },
        { start: 15, end: 35, speaker: "customer", text: "Hi Sarah, I'm calling about a maintenance issue at our office building. We have a leaking pipe in the second-floor restroom." },
        { start: 35, end: 55, speaker: "agent", text: "I'm sorry to hear that. Let me get some information to help you right away. Can I have your company name and address?" },
        { start: 55, end: 65, speaker: "customer", text: "Sure, it's TechCorp Solutions at 123 Business Park Drive." },
        { start: 65, end: 85, speaker: "agent", text: "Thank you. I've created a work order for you. Our technician will be there within 2 hours. Is there anything else I can help you with?" },
        { start: 85, end: 95, speaker: "customer", text: "No, that's all. Thank you for your quick response." },
        { start: 95, end: 100, speaker: "agent", text: "You're welcome! Have a great day." }
      ]
    },
    duration: 245,
    status: "completed"
  },
  {
    callId: "AC4801f735fdb658fc0a85b17g",
    fullText: "Agent: Hello, this is Mike from StrategicQuo calling to follow up on your recent service request. Customer: Oh hi Mike, yes I wanted to check on the status. Agent: I have your work order here. Our team completed the HVAC maintenance yesterday. Everything is working properly now. Customer: That's great to hear. The system is running much better. Agent: Excellent! Is there anything else we can help you with? Customer: No, that's all. Thanks for following up. Agent: You're welcome. Have a great day!",
    jsonPayload: {
      segments: [
        { start: 0, end: 12, speaker: "agent", text: "Hello, this is Mike from StrategicQuo calling to follow up on your recent service request." },
        { start: 12, end: 18, speaker: "customer", text: "Oh hi Mike, yes I wanted to check on the status." },
        { start: 18, end: 35, speaker: "agent", text: "I have your work order here. Our team completed the HVAC maintenance yesterday. Everything is working properly now." },
        { start: 35, end: 42, speaker: "customer", text: "That's great to hear. The system is running much better." },
        { start: 42, end: 48, speaker: "agent", text: "Excellent! Is there anything else we can help you with?" },
        { start: 48, end: 54, speaker: "customer", text: "No, that's all. Thanks for following up." },
        { start: 54, end: 60, speaker: "agent", text: "You're welcome. Have a great day!" }
      ]
    },
    duration: 180,
    status: "completed"
  },
  {
    callId: "AC6003h957hfd870he2c07d39i",
    fullText: "Agent: StrategicQuo Facilities, this is Tom speaking. Customer: Hi, I need emergency service. Our building's main water line burst. Agent: I understand this is urgent. Can you provide your location? Customer: We're at 456 Industrial Way. Water is flooding the basement. Agent: I'm dispatching our emergency team immediately. They should arrive within 30 minutes. Please try to shut off the main water valve if possible. Customer: Okay, I'll try to find it. How much will this cost? Agent: Our emergency service rate is $150 per hour plus materials. The team will provide an estimate when they arrive. Customer: Alright, please hurry. Agent: They're on their way now. Stay safe and we'll take care of this.",
    jsonPayload: {
      segments: [
        { start: 0, end: 8, speaker: "agent", text: "StrategicQuo Facilities, this is Tom speaking." },
        { start: 8, end: 18, speaker: "customer", text: "Hi, I need emergency service. Our building's main water line burst." },
        { start: 18, end: 28, speaker: "agent", text: "I understand this is urgent. Can you provide your location?" },
        { start: 28, end: 38, speaker: "customer", text: "We're at 456 Industrial Way. Water is flooding the basement." },
        { start: 38, end: 58, speaker: "agent", text: "I'm dispatching our emergency team immediately. They should arrive within 30 minutes. Please try to shut off the main water valve if possible." },
        { start: 58, end: 68, speaker: "customer", text: "Okay, I'll try to find it. How much will this cost?" },
        { start: 68, end: 88, speaker: "agent", text: "Our emergency service rate is $150 per hour plus materials. The team will provide an estimate when they arrive." },
        { start: 88, end: 93, speaker: "customer", text: "Alright, please hurry." },
        { start: 93, end: 100, speaker: "agent", text: "They're on their way now. Stay safe and we'll take care of this." }
      ]
    },
    duration: 320,
    status: "completed"
  }
];

const sampleAnalyses = [
  {
    callId: "AC3700e624eca547eb9f749a06f",
    score: 95,
    summary: "Excellent customer service interaction. Agent provided professional greeting, gathered necessary information efficiently, and offered quick resolution with 2-hour response time. Customer expressed satisfaction with the service.",
    complianceCheck: "Pass" as const,
    complianceNotes: "All compliance requirements met: proper greeting, company identification, issue resolution, and professional closing.",
    hasGreeting: true,
    hasClosing: true,
    concernsAddressed: true
  },
  {
    callId: "AC4801f735fdb658fc0a85b17g",
    score: 88,
    summary: "Good follow-up call. Agent proactively contacted customer to confirm service completion. Customer confirmed satisfaction with the HVAC maintenance work. Professional interaction throughout.",
    complianceCheck: "Pass" as const,
    complianceNotes: "Proper identification and follow-up protocol followed. Customer satisfaction confirmed.",
    hasGreeting: true,
    hasClosing: true,
    concernsAddressed: true
  },
  {
    callId: "AC6003h957hfd870he2c07d39i",
    score: 72,
    summary: "Emergency service call handled adequately. Agent responded to urgent situation and dispatched team quickly. However, pricing discussion could have been clearer upfront. Customer seemed concerned about cost.",
    complianceCheck: "Review" as const,
    complianceNotes: "Emergency protocol followed correctly. Pricing transparency could be improved - should mention emergency rates earlier in the call.",
    hasGreeting: true,
    hasClosing: true,
    concernsAddressed: true
  }
];

async function seed() {
  try {
    console.log("Seeding database...");
    
    // Insert calls
    console.log("Inserting sample calls...");
    await db.insert(calls).values(sampleCalls);
    
    // Insert transcripts
    console.log("Inserting sample transcripts...");
    await db.insert(transcripts).values(sampleTranscripts);
    
    // Insert analyses
    console.log("Inserting sample analyses...");
    await db.insert(analyses).values(sampleAnalyses);
    
    console.log("Database seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
}

seed();
