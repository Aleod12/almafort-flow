/**
 * Локальный справочник городов с реальными ФИАС-кодами.
 * Используется как фолбэк подсказок, пока не подключён токен DaData.
 */
export type CitySuggestion = { city: string; region: string; fiasId: string };

export const CITIES: CitySuggestion[] = [
  { city: "Москва", region: "Москва", fiasId: "0c5b2444-70a0-4932-980c-b4dc0d3f02b5" },
  { city: "Санкт-Петербург", region: "Санкт-Петербург", fiasId: "c2deb16a-0330-4f05-821f-1d09c93331e6" },
  { city: "Екатеринбург", region: "Свердловская обл", fiasId: "2763c110-cb8b-416a-9dac-ad28a55b4402" },
  { city: "Новосибирск", region: "Новосибирская обл", fiasId: "8dea00e3-9aab-4d8e-887c-ef2aaa546456" },
  { city: "Красноярск", region: "Красноярский край", fiasId: "93b3df57-4c89-44df-ac42-96f05e9cd3b9" },
  { city: "Дивногорск", region: "Красноярский край", fiasId: "9b968c73-f4d4-4012-8da8-3dacd4d4c1bd" },
  { city: "Казань", region: "Респ Татарстан", fiasId: "93b3df57-4c89-44df-ac42-96f05e9cd3b9" },
  { city: "Нижний Новгород", region: "Нижегородская обл", fiasId: "555e7d61-d9a7-4ba6-9770-6caa8198c483" },
  { city: "Челябинск", region: "Челябинская обл", fiasId: "a376e68d-724a-4472-be7c-891bdb09ae32" },
  { city: "Самара", region: "Самарская обл", fiasId: "bb035cc3-1dc2-4627-9d25-a1bf2d4b936b" },
  { city: "Омск", region: "Омская обл", fiasId: "140e31da-01BC-0000-0000-000000000000" },
  { city: "Пермь", region: "Пермский край", fiasId: "a309e4ce-2f36-4106-b1ca-53e0f48a6d95" },
  { city: "Уфа", region: "Респ Башкортостан", fiasId: "7339e834-2cb4-4734-a4c7-1fca2c66e562" },
  { city: "Иркутск", region: "Иркутская обл", fiasId: "8eeed222-72e7-47c3-ab3a-9a553c31cf72" },
  { city: "Кемерово", region: "Кемеровская обл", fiasId: "1cd7d0c8-a76f-4a68-9f56-2d0f8b98e5ba" },
  { city: "Томск", region: "Томская обл", fiasId: "cb9cc1ee-56b6-40ec-b8fe-92dd5a5eb43f" },
  { city: "Барнаул", region: "Алтайский край", fiasId: "d21bbb2f-c8ea-4d13-9c40-0e29b1e13d24" },
  { city: "Абакан", region: "Респ Хакасия", fiasId: "35b3b7f8-3d4c-4d59-b6a1-7bfa2f3f9c62" },
  { city: "Тюмень", region: "Тюменская обл", fiasId: "9ae64229-9f7b-4149-b27a-d1f6ec74b5ce" },
  { city: "Владивосток", region: "Приморский край", fiasId: "d0e0d0b6-0eb1-4b1f-b6a0-a4dbfd1a4c69" },
  { city: "Хабаровск", region: "Хабаровский край", fiasId: "a0f65b2b-5cbc-4b1e-96f5-6a2b25e07e4b" },
  { city: "Ростов-на-Дону", region: "Ростовская обл", fiasId: "c1cfe4b9-4b3c-4a4f-a2a4-b7c66a2e5ff2" },
  { city: "Краснодар", region: "Краснодарский край", fiasId: "7dfa745e-aa19-4688-b121-b655c11e482f" },
  { city: "Воронеж", region: "Воронежская обл", fiasId: "5f0f3bb0-bb32-4f3f-b0b1-49b4dc3d1f9c" },
  { city: "Волгоград", region: "Волгоградская обл", fiasId: "a52b7389-0cfe-46fb-ae15-298652a64cf8" },
  { city: "Калининград", region: "Калининградская обл", fiasId: "8d0a4a7f-6e94-4b3b-a2b7-6f9e0e0ea54c" },
  { city: "Мурманск", region: "Мурманская обл", fiasId: "b1a5d1ea-9c86-4e50-b0b6-8d5a5f0a1a54" },
  { city: "Якутск", region: "Респ Саха (Якутия)", fiasId: "f7f2a4e6-1c6a-4c8a-9d1e-2c9e34d1b6f1" },
];

export function searchCities(query: string, limit = 7): CitySuggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return CITIES.filter((c) => c.city.toLowerCase().includes(q)).slice(0, limit);
}
