// Временный диагностический хелпер генерации PDF.
export async function pdfSmoke(withSvg: boolean | string) {
  const pdfMakeModule = await import("pdfmake/build/pdfmake");
  const fontsModule = await import("pdfmake/build/vfs_fonts");
  const pdfMake = ((pdfMakeModule as any).default ?? pdfMakeModule) as any;
  const vfsSource = (fontsModule as any).default ?? fontsModule;
  pdfMake.addVirtualFileSystem(vfsSource.pdfMake?.vfs ?? vfsSource.vfs ?? vfsSource);
  pdfMake.addFonts({
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
  });
  const parts: Record<string, any> = {
    spacer: { text: " ", margin: [0, 6] },
    canvas: { canvas: [{ type: "line", x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 2, lineColor: "#E52421" }] },
    cols: { columns: [[{ text: "ALMAFORT" }], { width: 260, stack: [{ text: "ИП", alignment: "right" }] }] },
    table: {
      table: { headerRows: 1, widths: [18, 70, "*", 45, 55, 60], body: [[{ text: "№" }, { text: "Артикул" }, { text: "Наименование" }, { text: "Кол-во" }, { text: "Цена" }, { text: "Сумма" }], [{ text: "1" }, { text: "KR" }, { text: "Опора" }, { text: "1000" }, { text: "46,10" }, { text: "46 100,00" }]] },
      layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => "#D1D5DB", vLineColor: () => "#D1D5DB", paddingTop: () => 5, paddingBottom: () => 5 },
    },
  };
  if (typeof withSvg === "string") {
    return (await pdfMake.createPdf({ pageSize: "A4", pageMargins: [36, 36, 36, 48], defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.25 }, content: [parts[withSvg]] }).getBase64()).length;
  }
  const content: any[] = [{ text: "Тест" }];
  if (withSvg) content.push({ svg: '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="120"><circle cx="150" cy="60" r="52" fill="none" stroke="#1f4fd8" stroke-width="3"/><text x="150" y="52" text-anchor="middle" font-family="Helvetica" font-size="13" fill="#1f4fd8">ALMAFORT</text></svg>' });
  return (await pdfMake.createPdf({ content }).getBase64()).length;
}
