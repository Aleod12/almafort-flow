/** Единый источник правды по реквизитам. Меняем здесь — меняется везде. */
export const COMPANY = {
  legalName: "ИП Сазонов Евгений Олегович",
  postalCode: "660910",
  region: "Красноярский край",
  city: "Дивногорск",
  street: "ул. Чкалова, д. 59, кв. 202",
  addressFull: "660910, Красноярский край, г. Дивногорск, ул. Чкалова, д. 59, кв. 202",
  inn: "244600218744",
  ogrn: "307246405700033",
  phone: "8 (902) 922-97-34",
  phoneHref: "tel:+79029229734",
  site: "www.almafort.ru",
  siteUrl: "https://almafort.ru",
  /** Почта собирается по частям — в исходном HTML целиком не встречается. */
  emailUser: "almafort",
  emailHost: ["yandex", "ru"].join("."),
} as const;

export const companyEmail = () => `${COMPANY.emailUser}@${COMPANY.emailHost}`;
