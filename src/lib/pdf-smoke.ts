// Временный диагностический хелпер генерации PDF.
export async function pdfSmoke(withSvg: boolean) {
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
  const content: any[] = [{ text: "Тест" }];
  if (withSvg) content.push({ svg: '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="120"><circle cx="150" cy="60" r="52" fill="none" stroke="#1f4fd8" stroke-width="3"/><text x="150" y="52" text-anchor="middle" font-family="Helvetica" font-size="13" fill="#1f4fd8">ALMAFORT</text></svg>' });
  return (await pdfMake.createPdf({ content }).getBase64()).length;
}
