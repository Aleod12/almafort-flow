/**
 * Server-функции B2B-кабинета. Каждая работает от имени клиента (RLS),
 * поэтому чужие заказы физически недоступны даже при подмене id.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMPTY_LOYALTY, type LoyaltySummary } from "@/lib/loyalty";

const uuid = z.string().uuid();

export const getCabinet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [profileRes, companiesRes, ordersRes, loyaltyRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("companies").select("*").order("created_at", { ascending: true }),
      supabase
        .from("orders")
        .select("id, number, status, total, carrier, city, created_at, tracking_number")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.rpc("my_loyalty"),
    ]);

    const loyalty = (loyaltyRes.data as LoyaltySummary | null) ?? EMPTY_LOYALTY;
    return {
      profile: profileRes.data ?? null,
      companies: companiesRes.data ?? [],
      orders: ordersRes.data ?? [],
      loyalty: {
        total_spent: Number(loyalty.total_spent ?? 0),
        tier: (loyalty.tier ?? 1) as 1 | 2 | 3,
        next_threshold: loyalty.next_threshold ?? null,
      },
    };
  });

export const getOrderDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => ({ orderId: uuid.parse(input.orderId) }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Заказ не найден");

    const [events, docs] = await Promise.all([
      supabase
        .from("order_events")
        .select("*")
        .eq("order_id", data.orderId)
        .order("created_at", { ascending: true }),
      supabase.from("order_documents").select("*").eq("order_id", data.orderId),
    ]);
    return { order, events: events.data ?? [], documents: docs.data ?? [] };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { full_name: string; phone: string }) =>
    z
      .object({
        full_name: z.string().trim().max(120),
        phone: z.string().trim().max(32),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ full_name: data.full_name, phone: data.phone })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addCompanyByInn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { inn: string }) => ({
    inn: z
      .string()
      .trim()
      .regex(/^\d{10}$|^\d{12}$/, "ИНН — 10 цифр для юрлица или 12 для ИП")
      .parse(input.inn),
  }))
  .handler(async ({ data, context }) => {
    const { findPartyByInn } = await import("@/lib/dadata.server");
    const party = await findPartyByInn(data.inn);
    if (!party.name) throw new Error("Не удалось найти организацию по этому ИНН");

    const { data: row, error } = await context.supabase
      .from("companies")
      .upsert(
        {
          user_id: context.userId,
          inn: party.inn,
          kpp: party.kpp,
          name: party.name,
          legal_address: party.legalAddress,
          ogrn: party.ogrn,
          director: party.director,
        },
        { onConflict: "user_id,inn" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: uuid.parse(input.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("companies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const itemSchema = z.object({
  sku: z.string().max(64),
  name: z.string().max(240),
  quantity: z.number().int().min(1).max(1_000_000),
  unit: z.number().min(0),
  sum: z.number().min(0),
});

/** Сохраняет оформленный заказ в кабинет: карточка + первый этап + счёт. */
export const saveOrderToCabinet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        number: z.string().max(64),
        items: z.array(itemSchema).min(1).max(500),
        goodsPrice: z.number().min(0),
        deliveryPrice: z.number().min(0),
        total: z.number().min(0),
        carrier: z.enum(["cdek", "dl", "pickup"]),
        city: z.string().max(160).default(""),
        companyId: z.string().uuid().nullish(),
        deferred: z.boolean().default(false),
        invoiceUrl: z.string().url().max(1000).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const emailVerified =
      (claims as { email_verified?: boolean; user_metadata?: { email_verified?: boolean } })
        ?.email_verified ??
      (claims as { user_metadata?: { email_verified?: boolean } })?.user_metadata?.email_verified ??
      false;
    if (!emailVerified) {
      throw new Error(
        "Почта не подтверждена. Откройте письмо ALMAFORT и перейдите по ссылке — после этого оформление заказов в кабинете разблокируется.",
      );
    }
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        company_id: data.companyId ?? null,
        number: data.number,
        status: data.deferred ? "paid" : "awaiting_payment",
        items: data.items,
        goods_price: data.goodsPrice,
        delivery_price: data.deliveryPrice,
        total: data.total,
        carrier: data.carrier,
        city: data.city,
        deferred_payment: data.deferred,
      })
      .select("id, number")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("order_events").insert({
      order_id: order.id,
      stage: data.deferred ? "paid" : "awaiting_payment",
      title: data.deferred
        ? "Отгрузка с отсрочкой платежа: заказ принят в работу"
        : "Счёт сформирован, ожидаем оплату",
    });

    if (data.invoiceUrl) {
      await supabase.from("order_documents").insert({
        order_id: order.id,
        kind: "invoice",
        title: `Счёт на оплату № ${order.number}`,
        url: data.invoiceUrl,
      });
    }
    return order;
  });

/** «Повторить заказ»: отдаёт состав прошлой сделки для пересбора корзины. */
export const repeatOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => ({ orderId: uuid.parse(input.orderId) }))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("items")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Заказ не найден");
    const items = z
      .array(z.object({ sku: z.string(), quantity: z.number() }).passthrough())
      .catch([])
      .parse(order.items);

    // Свежие цены и актуальное наличие берём из текущего каталога, а не из старой сделки.
    const { PRODUCTS } = await import("@/data/catalog");
    const { unitPriceOf } = await import("@/lib/pricing");
    const lines = items.map((i) => {
      const qty = Math.max(1, Math.round(i.quantity));
      const product = PRODUCTS.find((p) => p.sku === i.sku);
      return {
        sku: i.sku,
        quantity: qty,
        available: Boolean(product) && !product!.is_service,
        name: product?.name ?? String(i.sku),
        unit: product ? unitPriceOf(product, qty) : 0,
        inStock: (product?.stock.qty ?? 0) >= qty,
        lead: product?.stock.lead ?? null,
      };
    });
    return {
      items: lines.filter((l) => l.available),
      unavailable: lines.filter((l) => !l.available).map((l) => l.name),
    };
  });
