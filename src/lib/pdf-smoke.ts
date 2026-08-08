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
  if (withSvg) content.push({ svg: '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><circle cx="25" cy="25" r="20" fill="none" stroke="red"/></svg>' });
  return (await pdfMake.createPdf({ content }).getBase64()).length;
}
