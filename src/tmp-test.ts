import { matchRow, extractQuantity } from "./lib/spec-matcher";
const cases = ["заглушка","чопик для трубы 20х40","ножка 15","ножка для мебели 50мм","крепеж кондиционера","уголок меб","крепс панельный","опора М6","Опора мебельная","заглушка d20","тетрагедрон 150","кляймер дпк","цемент М500","3d печать корпуса","стеклодержатель","заглушка для евровинта","ZGV-100x100","Петля накладная с доводчиком","крышка канистры","латодержатель под ламель"];
for (const c of cases) { const r = matchRow(c, 30); console.log(c.padEnd(32), r.status.padEnd(10), r.score, r.sku ?? `[${r.candidates.length} вар: ${r.candidates.slice(0,3).map(x=>x.sku).join(",")}]`); }
console.log([ "30 штук","1200шт","50","упаковка 100","" ].map(extractQuantity));
