import fs from 'node:fs/promises';
import { load } from 'cheerio';
const recovered=JSON.parse(await fs.readFile('src/content/recovered.json'));
const $=load(recovered.find(p=>p.data.path==='pistol/pistol6.html').data.body);
let league='';const rows=[];
$('tr').each((_,tr)=>{const cells=$(tr).children('td,th').map((_,td)=>$(td).text().replace(/\s+/g,' ').trim()).get().slice(1);if(/^(RIMFIRE|CENTER)/.test(cells[0])) league=cells[0];if(cells.length>=15 && /[a-z]/i.test(cells[0]) && !/^(RIMFIRE|CENTER|PINE|Name)/.test(cells[0])){const scores=cells.slice(1,21).map(v=>/^\d+$/.test(v)?Number(v):null);if(scores.some(v=>v!==null))rows.push({league,name:cells[0],scores});}});
await fs.writeFile('src/data/scores.json',JSON.stringify(rows,null,2));console.log(`Extracted ${rows.length} shooter rows`);
