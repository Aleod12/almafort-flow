import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(6).max(32),
    email: z.string().trim().email().max(160).optional().or(z.literal("")),
    company: z.string().trim().max(160).optional(),
    comment: z.string().trim().max(2000).optional(),
  }),
  // Реквизиты плательщика: 1С мэтчит контрагента именно по ИНН.
  inn: z
    .string()
    .trim()
    .regex(/^\d{10}(\d{2})?$/)
    .nullish(),
  kpp: z.string().trim().max(12).nullish(),
  city: z.string().trim().max(160).default(""),
  carrier: z.enum(["cdek", "dl", "pickup"]),
  deliveryPrice: z.number().min(0).max(1_000_000),
  goodsPrice: z.number().min(0).max(1_000_000_000),
  total: z.number().min(0).max(1_000_000_000),
  items: z
    .array(
      z.object({
        sku: z.string().max(64),
        name: z.string().max(240),
        quantity: z.number().int().min(1).max(1_000_000),
        unit: z.number().min(0),
        sum: z.number().min(0),
      }),
    )
    .min(1)
    .max(500),
  // PDF-счёт, сгенерированный на клиенте (pdfmake), в base64 — без префикса data:
  invoicePdfBase64: z.string().max(12_000_000).nullish(),
});

const CARRIER_LABEL = {
  cdek: "СДЭК",
  dl: "Деловые Линии",
  pickup: "Самовывоз",
} as const;

function b64ToBytes(b64: string) {
  const clean = b64.includes(",") ? (b64.split(",")[1] ?? "") : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const Route = createFileRoute("/api/checkout/submit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = schema.parse(await request.json());
        } catch (e) {
          return Response.json(
            { error: "Проверьте контактные данные и состав заказа", detail: String(e) },
            { status: 400 },
          );
        }

        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        let invoiceUrl: string | null = null;
        let storageNote: string | undefined;

        if (parsed.invoicePdfBase64) {
          try {
            const { uploadInvoice } = await import("@/lib/s3.server");
            const res = await uploadInvoice(
              `Schet_Almafort_${stamp}.pdf`,
              b64ToBytes(parsed.invoicePdfBase64),
            );
            invoiceUrl = res.url;
            storageNote = res.skipped;
          } catch (e) {
            console.error("[checkout] upload failed", e);
            storageNote = "Ошибка загрузки счёта в хранилище";
          }
        }

        const { pushToCrm } = await import("@/lib/crm.server");
        const crm = await pushToCrm({
          customer: {
            name: parsed.customer.name,
            phone: parsed.customer.phone,
            ...(parsed.customer.email ? { email: parsed.customer.email } : {}),
            ...(parsed.customer.company ? { company: parsed.customer.company } : {}),
            ...(parsed.customer.comment ? { comment: parsed.customer.comment } : {}),
          },
          city: parsed.city,
          carrierLabel: CARRIER_LABEL[parsed.carrier],
          deliveryPrice: parsed.deliveryPrice,
          goodsPrice: parsed.goodsPrice,
          total: parsed.total,
          invoiceUrl,
          items: parsed.items,
        });

        return Response.json({
          ok: true,
          orderId: `AF-${stamp}`,
          invoiceUrl,
          storageNote,
          crm: crm.crm,
          crmOk: crm.ok,
          crmDetail: crm.detail,
        });
      },
    },
  },
});
