/**
 * Реквизиты юрлица по ИНН через DaData (метод findById/party).
 * Без токена — мягкая деградация: возвращаем каркас, клиент дозаполняет руками.
 */
export type PartyInfo = {
  inn: string;
  kpp: string | null;
  name: string;
  legalAddress: string | null;
  ogrn: string | null;
  director: string | null;
  source: "dadata" | "manual";
};

export async function findPartyByInn(inn: string): Promise<PartyInfo> {
  const token = process.env["DADATA_API_KEY"];
  const fallback: PartyInfo = {
    inn,
    kpp: null,
    name: "",
    legalAddress: null,
    ogrn: null,
    director: null,
    source: "manual",
  };
  if (!token) return fallback;

  const res = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({ query: inn, count: 1 }),
  });
  if (!res.ok) return fallback;

  const json = (await res.json()) as {
    suggestions?: Array<{
      value?: string;
      data?: {
        inn?: string;
        kpp?: string;
        ogrn?: string;
        address?: { unrestricted_value?: string; value?: string };
        name?: { short_with_opf?: string; full_with_opf?: string };
        management?: { name?: string; post?: string };
        fio?: { surname?: string; name?: string; patronymic?: string };
      };
    }>;
  };
  const s = json.suggestions?.[0];
  if (!s?.data) return fallback;
  return {
    inn: s.data.inn ?? inn,
    kpp: s.data.kpp ?? null,
    name: s.data.name?.short_with_opf ?? s.value ?? "",
    legalAddress: s.data.address?.unrestricted_value ?? s.data.address?.value ?? null,
    ogrn: s.data.ogrn ?? null,
    director:
      s.data.management?.name ??
      [s.data.fio?.surname, s.data.fio?.name, s.data.fio?.patronymic].filter(Boolean).join(" ") ||
      null,
    source: "dadata",
  };
}
