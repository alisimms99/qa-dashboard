/**
 * Export utilities for generating PDF and DOCX reports
 */

import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import * as fs from 'fs';
import * as path from 'path';
import { getDb } from '../db';
import { calls, analyses } from '../../drizzle/schema';
import { and, eq, gte, lte } from 'drizzle-orm';

export interface ExportFilters {
  dateFilter?: string;
  scoreFilter?: string;
  phoneLineFilter?: string;
}

async function getFilteredCalls(filters: ExportFilters) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const conditions: any[] = [];

  // Date filter
  if (filters.dateFilter && filters.dateFilter !== 'all') {
    const now = new Date();
    let startDate: Date;

    if (filters.dateFilter === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (filters.dateFilter === 'week') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    } else if (filters.dateFilter === 'month') {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      startDate = new Date(0);
    }

    conditions.push(gte(calls.createdAt, startDate));
  }

  // Phone line filter
  if (filters.phoneLineFilter && filters.phoneLineFilter !== 'all') {
    if (filters.phoneLineFilter === 'main') {
      conditions.push(eq(calls.direction, 'incoming'));
    } else if (filters.phoneLineFilter === 'outbound') {
      conditions.push(eq(calls.direction, 'outgoing'));
    }
  }

  const query = db
    .select({
      call: calls,
      analysis: analyses,
    })
    .from(calls)
    .innerJoin(analyses, eq(calls.callId, analyses.callId));

  if (conditions.length > 0) {
    query.where(and(...conditions));
  }

  let results = await query;

  // Score filter (applied after join since it's on analyses table)
  if (filters.scoreFilter && filters.scoreFilter !== 'all') {
    if (filters.scoreFilter === 'high') {
      results = results.filter(r => r.analysis.score >= 85 && r.analysis.score <= 100);
    } else if (filters.scoreFilter === 'medium') {
      results = results.filter(r => r.analysis.score >= 70 && r.analysis.score < 85);
    } else if (filters.scoreFilter === 'low') {
      results = results.filter(r => r.analysis.score >= 0 && r.analysis.score < 70);
    }
  }

  return results;
}

export async function exportToPDF(filters: ExportFilters): Promise<string> {
  const callData = await getFilteredCalls(filters);

  // Create output directory if it doesn't exist
  const outputDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = `call-analysis-${Date.now()}.pdf`;
  const filepath = path.join(outputDir, filename);

  return new Promise<string>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    // Title
    doc.fontSize(20).text('Call Analysis Report', { align: 'center' });
    doc.moveDown();

    // Summary stats
    doc.fontSize(12);
    doc.text(`Total Calls: ${callData.length}`);
    doc.text(`Date Range: ${filters.dateFilter || 'All time'}`);
    doc.text(`Score Filter: ${filters.scoreFilter || 'All scores'}`);
    doc.text(`Phone Line: ${filters.phoneLineFilter || 'All lines'}`);
    doc.text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown();

    // Call details
    if (callData.length === 0) {
      doc.text('No calls match the selected filters.');
    } else {
      callData.forEach((item, index) => {
        const call = item.call;
        const analysis = item.analysis;

        doc.fontSize(10);
        doc.text(`Call ${index + 1}: ${call.callId}`, { underline: true });
        doc.text(`Date: ${new Date(call.createdAt).toLocaleString()}`);
        doc.text(`Direction: ${call.direction}`);
        doc.text(`From: ${call.fromNumber} → To: ${call.toNumber}`);
        doc.text(`Duration: ${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}`);
        doc.text(`Status: ${call.status}`);
        doc.text(`QA Score: ${analysis.score}/100`);
        doc.text(`Sentiment: ${analysis.sentiment || 'N/A'}`);
        doc.text(`Compliance: ${analysis.complianceCheck}`);
        if (analysis.summary) {
          doc.text(`Summary: ${analysis.summary.substring(0, 200)}${analysis.summary.length > 200 ? '...' : ''}`);
        }
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);
      });
    }

    doc.end();

    stream.on('finish', () => {
      resolve(filepath);
    });

    stream.on('error', (error) => {
      reject(error);
    });
  });
}

export async function exportToDOCX(filters: ExportFilters): Promise<string> {
  const callData = await getFilteredCalls(filters);

  // Create output directory if it doesn't exist
  const outputDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const children: Paragraph[] = [
    new Paragraph({
      text: "Call Analysis Report",
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      text: `Total Calls: ${callData.length}`,
    }),
    new Paragraph({
      text: `Date Range: ${filters.dateFilter || 'All time'}`,
    }),
    new Paragraph({
      text: `Score Filter: ${filters.scoreFilter || 'All scores'}`,
    }),
    new Paragraph({
      text: `Phone Line: ${filters.phoneLineFilter || 'All lines'}`,
    }),
    new Paragraph({
      text: `Generated: ${new Date().toLocaleString()}`,
    }),
    new Paragraph({ text: "" }), // Empty line
  ];

  if (callData.length === 0) {
    children.push(new Paragraph({
      text: "No calls match the selected filters.",
    }));
  } else {
    callData.forEach((item, index) => {
      const call = item.call;
      const analysis = item.analysis;

      children.push(
        new Paragraph({
          text: `Call ${index + 1}: ${call.callId}`,
          heading: HeadingLevel.HEADING_2,
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Date: ", bold: true }),
            new TextRun({ text: new Date(call.createdAt).toLocaleString() }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Direction: ", bold: true }),
            new TextRun({ text: call.direction }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "From: ", bold: true }),
            new TextRun({ text: `${call.fromNumber} → To: ${call.toNumber}` }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Duration: ", bold: true }),
            new TextRun({ text: `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}` }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "QA Score: ", bold: true }),
            new TextRun({ text: `${analysis.score}/100` }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Sentiment: ", bold: true }),
            new TextRun({ text: analysis.sentiment || 'N/A' }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Compliance: ", bold: true }),
            new TextRun({ text: analysis.complianceCheck }),
          ],
        }),
        analysis.summary ? new Paragraph({
          children: [
            new TextRun({ text: "Summary: ", bold: true }),
            new TextRun({ text: analysis.summary.substring(0, 500) + (analysis.summary.length > 500 ? '...' : '') }),
          ],
        }) : new Paragraph({ text: "" }),
        new Paragraph({ text: "" }), // Empty line between calls
      );
    });
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children,
    }],
  });

  const filename = `call-analysis-${Date.now()}.docx`;
  const filepath = path.join(outputDir, filename);
  const buffer = await Packer.toBuffer(doc);

  fs.writeFileSync(filepath, buffer);
  return filepath;
}

