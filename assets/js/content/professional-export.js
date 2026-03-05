const toColumnLabel = (index) => {
  let value = Math.max(1, Number(index) || 1);
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
};

const defaultTheme = {
  primaryBlue: '1F6FCB',
  deepBlue: '173A5E',
  headerBlue: '1B4E7C',
  lightBlue: 'EAF3FF',
  white: 'FFFFFF',
  metaBlue: 'F5FAFF',
  borderColor: 'D0E0F0'
};

const applyDataRowCellStyle = (cell, style, rowIndex, theme) => {
  const align = style?.align || 'left';
  cell.font = { name: 'Calibri', size: 10.5, color: { argb: `FF${theme.deepBlue}` } };
  cell.alignment = {
    vertical: 'middle',
    horizontal: align,
    wrapText: Boolean(style?.wrapText)
  };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${rowIndex % 2 === 0 ? theme.white : theme.lightBlue}` }
  };
  cell.border = {
    top: { style: 'thin', color: { argb: `FF${theme.borderColor}` } },
    left: { style: 'thin', color: { argb: `FF${theme.borderColor}` } },
    bottom: { style: 'thin', color: { argb: `FF${theme.borderColor}` } },
    right: { style: 'thin', color: { argb: `FF${theme.borderColor}` } }
  };
};

const downloadWorkbook = async (workbook, fileName) => {
  const workbookBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([workbookBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export const exportProfessionalWorkbook = async ({
  fileName,
  sheetName,
  title,
  subtitle,
  contextLine,
  contextLineRich,
  metaLine,
  columns,
  rows,
  note,
  signatures,
  footerSections,
  logoUrl = '/branding/bhanoyi-logo.png',
  afterRows
}) => {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Bhanoyi Secondary School Website';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName || 'Export', {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.55,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2
      }
    }
  });

  sheet.headerFooter.oddFooter = '&LConfidential school record&RPage &P of &N';

  const safeColumns = Array.isArray(columns) && columns.length
    ? columns
    : [{ key: 'value', header: 'Value', width: 32, align: 'left', wrapText: true }];
  const safeRows = Array.isArray(rows) ? rows : [];

  sheet.views = [{ state: 'frozen', ySplit: 8 }];
  sheet.columns = safeColumns.map((entry, index) => ({
    header: entry.header || `Column ${index + 1}`,
    key: entry.key || `col_${index + 1}`,
    width: Math.max(8, Number(entry.width) || 16)
  }));

  const theme = { ...defaultTheme };
  const endColumnLabel = toColumnLabel(safeColumns.length);

  sheet.mergeCells(`A1:${endColumnLabel}1`);
  sheet.mergeCells(`A2:${endColumnLabel}2`);
  sheet.mergeCells(`A3:${endColumnLabel}3`);
  sheet.mergeCells(`A4:${endColumnLabel}4`);
  sheet.mergeCells(`A5:${endColumnLabel}5`);
  sheet.getCell('A1').value = 'BHANOYI SECONDARY SCHOOL';
  sheet.getCell('A2').value = title || 'Official Export';
  if (Array.isArray(contextLineRich) && contextLineRich.length) {
    sheet.getCell('A3').value = {
      richText: contextLineRich
        .filter((entry) => entry && typeof entry === 'object' && String(entry.text || '').length)
        .map((entry) => {
          const normalizedColor = String(entry.color || '')
            .trim()
            .replace('#', '')
            .toUpperCase();
          const isValidColor = /^[0-9A-F]{6}$/.test(normalizedColor) || /^[0-9A-F]{8}$/.test(normalizedColor);
          return {
            text: String(entry.text || ''),
            font: {
              name: 'Calibri',
              bold: true,
              size: 10.5,
              color: { argb: isValidColor ? `FF${normalizedColor.slice(-6)}` : `FF${theme.white}` }
            }
          };
        })
    };
  } else {
    sheet.getCell('A3').value = contextLine || '';
  }
  sheet.getCell('A4').value = metaLine || '';
  sheet.getCell('A5').value = `Generated on: ${new Date().toLocaleString('en-GB')}`;

  ['A1', 'A2', 'A3', 'A4', 'A5'].forEach((ref, index) => {
    const cell = sheet.getCell(ref);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.font = {
      name: 'Calibri',
      size: index === 0 ? 17 : index === 1 ? 13 : 10.5,
      bold: index <= 2,
      color: { argb: index <= 2 ? `FF${theme.white}` : `FF${theme.deepBlue}` }
    };
    if (index <= 2) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${index === 0 ? theme.deepBlue : theme.primaryBlue}` }
      };
    } else {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${theme.metaBlue}` }
      };
    }
  });

  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 22;
  sheet.getRow(3).height = 20;
  sheet.getRow(4).height = 18;
  sheet.getRow(5).height = 18;

  if (subtitle) {
    sheet.getCell('A3').value = subtitle;
  }

  try {
    const logoResponse = await fetch(logoUrl);
    if (logoResponse.ok) {
      const logoBlob = await logoResponse.blob();
      const logoBuffer = await logoBlob.arrayBuffer();
      const imageId = workbook.addImage({
        buffer: logoBuffer,
        extension: 'png'
      });

      let logoWidth = 86;
      let logoHeight = 86;
      try {
        const bitmap = await createImageBitmap(logoBlob);
        const intrinsicWidth = Number(bitmap.width) || 1;
        const intrinsicHeight = Number(bitmap.height) || 1;
        const aspectRatio = intrinsicWidth / intrinsicHeight;
        const targetHeight = 86;
        logoHeight = targetHeight;
        logoWidth = Math.max(42, Math.min(120, Math.round(targetHeight * aspectRatio)));
        bitmap.close();
      } catch {
        // Fall back to square logo frame if intrinsic dimensions are unavailable.
      }

      sheet.addImage(imageId, {
        tl: { col: 0.1, row: 0.15 },
        ext: { width: logoWidth, height: logoHeight }
      });
    }
  } catch {
    // Optional branding image.
  }

  const headerRowNumber = 7;
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.values = safeColumns.map((entry) => entry.header || '');
  headerRow.height = 20;
  headerRow.eachCell((cell) => {
    cell.font = {
      name: 'Calibri',
      size: 10.5,
      bold: true,
      color: { argb: `FF${theme.white}` }
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${theme.headerBlue}` }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: `FF${theme.borderColor}` } },
      left: { style: 'thin', color: { argb: `FF${theme.borderColor}` } },
      bottom: { style: 'medium', color: { argb: `FF${theme.borderColor}` } },
      right: { style: 'thin', color: { argb: `FF${theme.borderColor}` } }
    };
  });

  const dataStartRow = headerRowNumber + 1;
  safeRows.forEach((rowValue, rowIndex) => {
    const row = sheet.getRow(dataStartRow + rowIndex);
    row.height = 18;

    safeColumns.forEach((column, columnIndex) => {
      const key = String(column.key || `col_${columnIndex + 1}`);
      const cell = row.getCell(columnIndex + 1);
      cell.value = rowValue && typeof rowValue === 'object' ? rowValue[key] ?? '' : '';
      applyDataRowCellStyle(cell, column, rowIndex, theme);
    });
  });

  if (typeof afterRows === 'function') {
    afterRows({
      workbook,
      sheet,
      dataStartRow,
      rowCount: safeRows.length,
      columnCount: safeColumns.length
    });
  }

  let footerRowNumber = dataStartRow + safeRows.length + 2;

  if (note) {
    sheet.mergeCells(`A${footerRowNumber}:${endColumnLabel}${footerRowNumber}`);
    const noteCell = sheet.getCell(`A${footerRowNumber}`);
    noteCell.value = note;
    noteCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: `FF${theme.deepBlue}` } };
    noteCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    footerRowNumber += 2;
  }

  const safeSignatures = Array.isArray(signatures)
    ? signatures
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry, index) => ({
          name: String(entry.name || '').trim(),
          role: String(entry.role || '').trim(),
          anchor: entry.anchor === 'right' ? 'right' : entry.anchor === 'center' ? 'center' : index === 0 ? 'left' : 'right',
          shiftColumns: Math.max(0, Math.floor(Number(entry.shiftColumns) || 0))
        }))
    : [];

  if (safeSignatures.length) {
    const midpoint = Math.ceil(safeColumns.length / 2);
    const leftRange = { start: 1, end: Math.max(1, midpoint) };
    const rightRange = {
      start: Math.min(safeColumns.length, midpoint + 1),
      end: Math.max(Math.min(safeColumns.length, midpoint + 1), safeColumns.length)
    };

    const resolveLineRange = (range, anchor) => {
      const width = Math.max(1, range.end - range.start + 1);
      const span = Math.max(2, Math.min(4, width));
      if (anchor === 'right') {
        return { start: range.start, end: Math.min(range.end, range.start + span - 1) };
      }
      if (anchor === 'center') {
        const start = range.start + Math.max(0, Math.floor((width - span) / 2));
        return { start, end: Math.min(range.end, start + span - 1) };
      }
      return { start: range.start, end: Math.min(range.end, range.start + span - 1) };
    };

    const resolveBlockRange = (range, signature) => {
      if (!signature || signature.anchor !== 'right') {
        return { ...range };
      }

      const width = Math.max(1, range.end - range.start + 1);
      const minWidth = Math.min(3, width);
      const requestedShift = Math.min(signature.shiftColumns || 0, Math.max(0, width - minWidth));
      const shiftedStart = range.start + requestedShift;
      const adjustedStart = Math.min(shiftedStart, range.end - minWidth + 1);
      return {
        start: Math.max(range.start, adjustedStart),
        end: range.end
      };
    };

    const applySignatureBlock = (signature, range) => {
      if (!signature || range.start > range.end) return;

      const effectiveRange = resolveBlockRange(range, signature);
      if (effectiveRange.start > effectiveRange.end) return;

      const blankSignatureRow = footerRowNumber;
      const signatureLineRow = footerRowNumber + 1;
      const nameLabelRow = footerRowNumber + 2;
      const roleLabelRow = footerRowNumber + 3;
      const dateLabelRow = footerRowNumber + 4;
      const startLabel = toColumnLabel(effectiveRange.start);
      const endLabel = toColumnLabel(effectiveRange.end);
      const shortLineRange = resolveLineRange(effectiveRange, signature.anchor);

      sheet.mergeCells(`${startLabel}${blankSignatureRow}:${endLabel}${blankSignatureRow}`);
      sheet.getCell(`${startLabel}${blankSignatureRow}`).value = '';

      for (let columnIndex = shortLineRange.start; columnIndex <= shortLineRange.end; columnIndex += 1) {
        const lineCell = sheet.getRow(signatureLineRow).getCell(columnIndex);
        lineCell.border = {
          top: { style: 'thick', color: { argb: `FF${theme.deepBlue}` } }
        };
      }

      sheet.mergeCells(`${startLabel}${nameLabelRow}:${endLabel}${nameLabelRow}`);
      sheet.mergeCells(`${startLabel}${roleLabelRow}:${endLabel}${roleLabelRow}`);
      sheet.mergeCells(`${startLabel}${dateLabelRow}:${endLabel}${dateLabelRow}`);

      const alignment = signature.anchor === 'center' ? 'center' : 'left';

      const nameCell = sheet.getCell(`${startLabel}${nameLabelRow}`);
      nameCell.value = 'Name:';
      nameCell.font = { name: 'Calibri', size: 10, color: { argb: `FF${theme.deepBlue}` } };
      nameCell.alignment = { horizontal: alignment, vertical: 'middle', wrapText: true };

      const roleCell = sheet.getCell(`${startLabel}${roleLabelRow}`);
      roleCell.value = signature.role || '';
      roleCell.font = { name: 'Calibri', size: 10, color: { argb: `FF${theme.deepBlue}` } };
      roleCell.alignment = { horizontal: alignment, vertical: 'middle', wrapText: true };

      const dateCell = sheet.getCell(`${startLabel}${dateLabelRow}`);
      dateCell.value = 'Date:';
      dateCell.font = { name: 'Calibri', size: 10, color: { argb: `FF${theme.deepBlue}` } };
      dateCell.alignment = { horizontal: alignment, vertical: 'middle', wrapText: true };

      sheet.getRow(blankSignatureRow).height = Math.max(sheet.getRow(blankSignatureRow).height || 16, 16);
      sheet.getRow(signatureLineRow).height = Math.max(sheet.getRow(signatureLineRow).height || 16, 16);
      sheet.getRow(nameLabelRow).height = Math.max(sheet.getRow(nameLabelRow).height || 16, 16);
      sheet.getRow(roleLabelRow).height = Math.max(sheet.getRow(roleLabelRow).height || 18, 18);
      sheet.getRow(dateLabelRow).height = Math.max(sheet.getRow(dateLabelRow).height || 16, 16);
    };

    if (safeSignatures.length === 1) {
      const onlySignature = safeSignatures[0];
      if (onlySignature.anchor === 'right') {
        applySignatureBlock(onlySignature, rightRange);
      } else if (onlySignature.anchor === 'left') {
        applySignatureBlock(onlySignature, leftRange);
      } else {
        applySignatureBlock(onlySignature, { start: 1, end: safeColumns.length });
      }
    } else {
      const leftSignature = safeSignatures.find((entry) => entry.anchor === 'left') || safeSignatures[0];
      const rightSignature = safeSignatures.find((entry) => entry.anchor === 'right') || safeSignatures[1] || null;

      applySignatureBlock(leftSignature, leftRange);
      if (rightSignature) {
        applySignatureBlock(rightSignature, rightRange);
      }
    }
  }

  if (safeSignatures.length) {
    footerRowNumber += 6;
  }

  const safeFooterSections = Array.isArray(footerSections)
    ? footerSections
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          title: String(entry.title || '').trim(),
          lines: Array.isArray(entry.lines)
            ? entry.lines.map((line) => String(line || '').trim()).filter(Boolean)
            : []
        }))
        .filter((entry) => entry.title || entry.lines.length)
    : [];

  if (safeFooterSections.length) {
    let sectionRow = footerRowNumber;
    safeFooterSections.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) {
        sectionRow += 1;
      }

      sheet.mergeCells(`A${sectionRow}:${endColumnLabel}${sectionRow}`);
      const titleCell = sheet.getCell(`A${sectionRow}`);
      titleCell.value = section.title || `Summary ${sectionIndex + 1}`;
      titleCell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: `FF${theme.deepBlue}` } };
      titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${theme.metaBlue}` }
      };
      sectionRow += 1;

      section.lines.forEach((line) => {
        sheet.mergeCells(`A${sectionRow}:${endColumnLabel}${sectionRow}`);
        const lineCell = sheet.getCell(`A${sectionRow}`);
        lineCell.value = line;
        lineCell.font = { name: 'Calibri', size: 10, color: { argb: `FF${theme.deepBlue}` } };
        lineCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        sectionRow += 1;
      });
    });
  }

  const normalizedFileName = String(fileName || 'export.xlsx').trim() || 'export.xlsx';
  const withExtension = normalizedFileName.toLowerCase().endsWith('.xlsx') ? normalizedFileName : `${normalizedFileName}.xlsx`;
  await downloadWorkbook(workbook, withExtension);
};
