export type MuseSettings = {model: 'muse-spark-1.3'|'muse-spark-1.2'|'muse-spark-1.1'; reasoning:'low'|'medium'; routing:'off'|'auto'|'always'; automation:boolean};
export const defaultMuseSettings:MuseSettings={model:'muse-spark-1.3',reasoning:'low',routing:'off',automation:false};
export function readMuseSettings():MuseSettings {
  try {const s=JSON.parse(localStorage.getItem('sovereign-muse-settings')||'{}');return {
    model:['muse-spark-1.3','muse-spark-1.2','muse-spark-1.1'].includes(s.model)?s.model:defaultMuseSettings.model,
    reasoning:s.reasoning==='medium'?'medium':'low',routing:['auto','always'].includes(s.routing)?s.routing:'off',automation:s.automation===true
  };}catch{return {...defaultMuseSettings};}
}
export function routeMuse(prompt:string,settings:MuseSettings){return settings.routing==='always'||settings.routing==='auto'&&/\b(code|coding|architecture|design|review|compare|evaluate|debug|plan|analysis)\b/i.test(prompt);}
