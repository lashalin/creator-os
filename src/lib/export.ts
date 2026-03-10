import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import jsPDF from "jspdf";

export async function exportToWord(title: string, content: string, platform: string, contentType: string) {
  const lines = content.split("\n");
  const paragraphs: Paragraph[] = [];

  // Title
  paragraphs.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    })
  );

  // Meta info
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `平台：${platform}  |  类型：${contentType === "graphic" ? "图文" : "口播逐字稿"}`,
          color: "999999",
          size: 20,
        }),
      ],
      spacing: { after: 400 },
    })
  );

  // Content
  for (const line of lines) {
    if (line.trim() === "") {
      paragraphs.push(new Paragraph({ text: "", spacing: { after: 100 } }));
    } else {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              size: 24,
            }),
          ],
          spacing: { after: 120 },
          alignment: AlignmentType.JUSTIFIED,
        })
      );
    }
  }

  // Footer
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `\n由 CreatorOS 生成 · ${new Date().toLocaleDateString("zh-CN")}`,
          color: "cccccc",
          size: 18,
        }),
      ],
      spacing: { before: 600 },
    })
  );

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.slice(0, 30)}_${platform}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPDF(title: string, content: string, platform: string, contentType: string) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  // Title
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  const titleLines = doc.splitTextToSize(title, maxWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 8 + 6;

  // Meta
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text(`${platform}  ·  ${contentType === "graphic" ? "图文" : "口播逐字稿"}  ·  ${new Date().toLocaleDateString("zh-CN")}`, margin, y);
  y += 10;

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Content
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  const lines = content.split("\n");

  for (const line of lines) {
    if (y > pageHeight - margin - 15) {
      doc.addPage();
      y = margin;
    }
    if (line.trim() === "") {
      y += 4;
      continue;
    }
    const wrappedLines = doc.splitTextToSize(line, maxWidth);
    doc.text(wrappedLines, margin, y);
    y += wrappedLines.length * 6 + 2;
  }

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(180, 180, 180);
  doc.text("由 CreatorOS 生成", margin, pageHeight - 10);

  doc.save(`${title.slice(0, 30)}_${platform}.pdf`);
}
