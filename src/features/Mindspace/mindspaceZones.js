/**
 * Mindspace spatial vocabulary. Zones describe the TOPIC, not its author.
 * A tentative zone uses only saved title words; never claim an AI analysis,
 * user-consented semantic edge or psychological judgement.
 */
export const MINDSPACE_ZONES = Object.freeze([
  Object.freeze({id:'reflection',label:'Рефлексия',icon:'reflection',
    x:.22,y:.20,words:['рефлекс','осозн','мысл','дневник','себе','чувств','пережив']}),
  Object.freeze({id:'professional',label:'Профессиональный рост',icon:'goal',
    x:.78,y:.20,words:['работ','карьер','бизнес','проект','релиз','продукт','код','разработ','mvp','продаж','заказ']}),
  Object.freeze({id:'analysis',label:'Анализ и решения',icon:'analytic',
    x:.84,y:.55,words:['анализ','разбор','выбор','сравн','причин','проблем','оцен','рис','решени']}),
  Object.freeze({id:'dialogue',label:'Общение и отношения',icon:'companion',
    x:.70,y:.81,words:['разговор','общени','друз','семь','отношени','общест','коллег','партнер','команд']}),
  Object.freeze({id:'personal',label:'Личное развитие',icon:'support',
    x:.28,y:.79,words:['привыч','обуч','спорт','здоров','отдых','ресурс','развит','сон','баланс']}),
  Object.freeze({id:'finance',label:'Финансы и устойчивость',icon:'goal',
    x:.50,y:.11,words:['финанс','доход','деньг','зарплат','бюджет','долг','расход','прибыл']}),
  Object.freeze({id:'wellbeing',label:'Здоровье и энергия',icon:'support',
    x:.12,y:.52,words:['самочув','здоровье','тренир','питан','физич','энерг','восстанов']}),
  Object.freeze({id:'creativity',label:'Творчество и идеи',icon:'reflection',
    x:.51,y:.88,words:['творч','музык','рисован','дизайн','вдохнов','воображ','созидан']}),
  Object.freeze({id:'other',label:'Другие темы',icon:'information',
    x:.50,y:.49,words:[]})
]);
const ALLOWED = new Set(MINDSPACE_ZONES.map(item=>item.id));
export function isZone(id) {return typeof id==='string' && ALLOWED.has(id);}
export function suggestMindZone(label) {
  const name=typeof label==='string'?label.toLowerCase().slice(0,200):'';
  // Deterministic, intentionally conservative. Automatic geometry is
  // a UI suggestion only; user may override it with a stored zone.
  let best='other',score=0;
  for(const area of MINDSPACE_ZONES) {
    if(area.id==='other')continue;
    const matches=area.words.filter(word=>name.includes(word)).length;
    if(matches>score){score=matches;best=area.id;}
  }
  return best;
}
export function resolveMindZone(session,label) {
  const manual=session?.mindZone;
  if(manual?.author==='user' && manual?.status==='confirmed' &&
      isZone(manual.id)) {
    return Object.freeze({id:manual.id,confirmedByOwner:true});
  }
  return Object.freeze({id:suggestMindZone(label),confirmedByOwner:false});
}
export function mindZoneLabel(id) {
  return MINDSPACE_ZONES.find(zone=>zone.id===id)?.label || 'Другие темы';
}
