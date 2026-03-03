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
  metaLine,
  columns,
  rows,
  note,
  signatures,
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
  sheet.getCell('A3').value = contextLine || '';
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
      const logoBuffer = await logoResponse.arrayBuffer();
      const imageId = workbook.addImage({
        buffer: logoBuffer,
        extension: 'png'
      });
      sheet.addImage(imageId, {
        tl: { col: 0.1, row: 0.15 },
        ext: { width: 86, height: 86 }
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
          anchor: entry.anchor === 'right' ? 'right' : index === 0 ? 'left' : 'right'
        }))
    : [];

  if (safeSignatures.length) {
    const midpoint = Math.ceil(safeColumns.length / 2);
    const leftRange = { start: 1, end: Math.max(1, midpoint) };
    const rightRange = {
      start: Math.min(safeColumns.length, midpoint + 1),
      end: Math.max(Math.min(safeColumns.length, midpoint + 1), safeColumns.length)
    };

    const applySignatureBlock = (signature, range) => {
      if (!signature || range.start > range.end) return;

      const lineRow = footerRowNumber;
      const nameRow = footerRowNumber + 1;
      const roleRow = footerRowNumber + 2;
      const hintRow = footerRowNumber + 3;
      const startLabel = toColumnLabel(range.start);
      const endLabel = toColumnLabel(range.end);

      for (let columnIndex = range.start; columnIndex <= range.end; columnIndex += 1) {
        const lineCell = sheet.getRow(lineRow).getCell(columnIndex);
        lineCell.border = {
          top: { style: 'medium', color: { argb: `FF${theme.deepBlue}` } }
        };
      }

      sheet.mergeCells(`${startLabel}${nameRow}:${endLabel}${nameRow}`);
      sheet.mergeCells(`${startLabel}${roleRow}:${endLabel}${roleRow}`);
      sheet.mergeCells(`${startLabel}${hintRow}:${endLabel}${hintRow}`);

      const alignment = signature.anchor === 'right' ? 'right' : 'left';
      const nameCell = sheet.getCell(`${startLabel}${nameRow}`);
      nameCell.value = signature.name || '';
      nameCell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: `FF${theme.deepBlue}` } };
      nameCell.alignment = { horizontal: alignment, vertical: 'middle' };

      const roleCell = sheet.getCell(`${startLabel}${roleRow}`);
      roleCell.value = signature.role || '';
      roleCell.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: `FF${theme.deepBlue}` } };
      roleCell.alignment = { horizontal: alignment, vertical: 'middle' };

      const hintCell = sheet.getCell(`${startLabel}${hintRow}`);
      hintCell.value = 'Signature & Date';
      hintCell.font = { name: 'Calibri', size: 9, color: { argb: `FF${theme.deepBlue}` } };
      hintCell.alignment = { horizontal: alignment, vertical: 'middle' };
    };

    const leftSignature = safeSignatures.find((entry) => entry.anchor === 'left') || safeSignatures[0];
    const rightSignature = safeSignatures.find((entry) => entry.anchor === 'right') || safeSignatures[1] || null;

    applySignatureBlock(leftSignature, leftRange);
    if (rightSignature) {
      applySignatureBlock(rightSignature, rightRange);
    }
  }

  const normalizedFileName = String(fileName || 'export.xlsx').trim() || 'export.xlsx';
  const withExtension = normalizedFileName.toLowerCase().endsWith('.xlsx') ? normalizedFileName : `${normalizedFileName}.xlsx`;
  await downloadWorkbook(workbook, withExtension);
};
