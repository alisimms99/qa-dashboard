import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, AlignmentType, WidthType } from 'docx';
import Papa from 'papaparse';

interface Call {
  id: number;
  callId: string;
  direction: 'incoming' | 'outgoing';
  fromNumber: string;
  toNumber: string;
  duration: number | null;
  status: string;
  createdAt: Date | string;
  phoneNumberId?: string | null;
  analyses?: Array<{
    score: number;
    complianceCheck: string;
  }>;
}

interface Stats {
  totalCalls: number;
  totalAnalyzed: number;
  averageScore: number;
  complianceRate: number;
}

interface Filters {
  timeRange?: string;
  scoreRange?: string;
  phoneNumberId?: string | null;
  dateFilter?: string;
  scoreFilter?: string;
  phoneLineFilter?: string;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatFilters(filters: Filters): string {
  const parts: string[] = [];
  
  if (filters.dateFilter && filters.dateFilter !== 'all') {
    parts.push(`Time: ${filters.dateFilter}`);
  } else if (filters.timeRange && filters.timeRange !== 'all') {
    parts.push(`Time: ${filters.timeRange}`);
  }
  
  if (filters.scoreFilter && filters.scoreFilter !== 'all') {
    parts.push(`Score: ${filters.scoreFilter}`);
  } else if (filters.scoreRange && filters.scoreRange !== 'all') {
    parts.push(`Score: ${filters.scoreRange}`);
  }
  
  if (filters.phoneLineFilter && filters.phoneLineFilter !== 'all') {
    parts.push(`Line: ${filters.phoneLineFilter}`);
  } else if (filters.phoneNumberId) {
    parts.push(`Line: ${filters.phoneNumberId}`);
  }
  
  return parts.length > 0 ? parts.join(', ') : 'None';
}

export async function exportToPDF(calls: Call[], stats: Stats, filters: Filters) {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.text('QA Dashboard Report', 14, 20);
  
  // Filters applied
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
  doc.text(`Filters: ${formatFilters(filters)}`, 14, 35);
  
  // Summary Stats
  doc.setFontSize(14);
  doc.text('Summary Statistics', 14, 45);
  
  const statsData = [
    ['Total Calls', stats.totalCalls.toString()],
    ['Total Analyzed', stats.totalAnalyzed.toString()],
    ['Average QA Score', `${stats.averageScore}/100`],
    ['Compliance Rate', `${stats.complianceRate}%`],
  ];
  
  autoTable(doc, {
    startY: 50,
    head: [['Metric', 'Value']],
    body: statsData,
    theme: 'striped',
    headStyles: { fillColor: [66, 139, 202] },
  });
  
  // Call List
  doc.setFontSize(14);
  doc.text('Call Records', 14, (doc as any).lastAutoTable.finalY + 10);
  
  const callData = calls.map(call => {
    const date = new Date(call.createdAt);
    const analysis = call.analyses?.[0];
    
    return [
      date.toLocaleDateString(),
      call.direction.charAt(0).toUpperCase() + call.direction.slice(1),
      call.fromNumber || 'N/A',
      call.toNumber || 'N/A',
      formatDuration(call.duration || 0),
      call.status,
      analysis?.score?.toString() || 'N/A',
    ];
  });
  
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 15,
    head: [['Date', 'Direction', 'From', 'To', 'Duration', 'Status', 'Score']],
    body: callData,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [66, 139, 202] },
    theme: 'striped',
  });
  
  // Download
  const filename = `QA_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

export async function exportToDOCX(calls: Call[], stats: Stats, filters: Filters) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Title
        new Paragraph({
          text: 'QA Dashboard Report',
          heading: 'Heading1',
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        
        // Date and filters
        new Paragraph({
          children: [
            new TextRun({ text: `Generated: ${new Date().toLocaleDateString()}`, break: 1 }),
            new TextRun({ text: `Filters: ${formatFilters(filters)}`, break: 1 }),
          ],
          spacing: { after: 400 },
        }),
        
        // Summary Statistics
        new Paragraph({
          text: 'Summary Statistics',
          heading: 'Heading2',
          spacing: { before: 400, after: 200 },
        }),
        
        new Table({
          width: {
            size: 100,
            type: WidthType.PERCENTAGE,
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ text: 'Metric', bold: true })],
                }),
                new TableCell({
                  children: [new Paragraph({ text: 'Value', bold: true })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph('Total Calls')],
                }),
                new TableCell({
                  children: [new Paragraph(stats.totalCalls.toString())],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph('Total Analyzed')],
                }),
                new TableCell({
                  children: [new Paragraph(stats.totalAnalyzed.toString())],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph('Average QA Score')],
                }),
                new TableCell({
                  children: [new Paragraph(`${stats.averageScore}/100`)],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph('Compliance Rate')],
                }),
                new TableCell({
                  children: [new Paragraph(`${stats.complianceRate}%`)],
                }),
              ],
            }),
          ],
        }),
        
        // Call Records
        new Paragraph({
          text: 'Call Records',
          heading: 'Heading2',
          spacing: { before: 400, after: 200 },
        }),
        
        new Table({
          width: {
            size: 100,
            type: WidthType.PERCENTAGE,
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ text: 'Date', bold: true })],
                }),
                new TableCell({
                  children: [new Paragraph({ text: 'Direction', bold: true })],
                }),
                new TableCell({
                  children: [new Paragraph({ text: 'From', bold: true })],
                }),
                new TableCell({
                  children: [new Paragraph({ text: 'To', bold: true })],
                }),
                new TableCell({
                  children: [new Paragraph({ text: 'Duration', bold: true })],
                }),
                new TableCell({
                  children: [new Paragraph({ text: 'Status', bold: true })],
                }),
                new TableCell({
                  children: [new Paragraph({ text: 'Score', bold: true })],
                }),
              ],
            }),
            ...calls.map(call => {
              const date = new Date(call.createdAt);
              
              return new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph(date.toLocaleDateString())],
                  }),
                  new TableCell({
                    children: [new Paragraph(call.direction.charAt(0).toUpperCase() + call.direction.slice(1))],
                  }),
                  new TableCell({
                    children: [new Paragraph(call.fromNumber || 'N/A')],
                  }),
                  new TableCell({
                    children: [new Paragraph(call.toNumber || 'N/A')],
                  }),
                  new TableCell({
                    children: [new Paragraph(formatDuration(call.duration || 0))],
                  }),
                  new TableCell({
                    children: [new Paragraph(call.status)],
                  }),
                  new TableCell({
                    children: [new Paragraph('N/A')], // Score would need to be fetched separately
                  }),
                ],
              });
            }),
          ],
        }),
      ],
    }],
  });
  
  const blob = await Packer.toBlob(doc);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `QA_Report_${new Date().toISOString().split('T')[0]}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function exportToCSV(calls: Call[]) {
  const data = calls.map(call => {
    const date = new Date(call.createdAt);
    
    return {
      Date: date.toLocaleDateString(),
      Time: date.toLocaleTimeString(),
      Direction: call.direction.charAt(0).toUpperCase() + call.direction.slice(1),
      From: call.fromNumber || '',
      To: call.toNumber || '',
      Duration: call.duration || 0,
      'Duration (formatted)': formatDuration(call.duration || 0),
      Status: call.status,
      'Phone Line': call.phoneNumberId || '',
      'Call ID': call.callId,
    };
  });
  
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `QA_Data_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

