import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.THEME_URL || 'http://127.0.0.1:4321';
const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const route of ['/','/scores/','/news/','/events/','/photos/','/ranges/','/membership/','/classes/','/history/','/contact/','/search/','/calendar.html','/original-home.html']){
  const response=await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(response.status(),200,route);
  if(!route.endsWith('.html'))assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Mobile overflow: ${route}`);
 }
 await page.goto(base+'/');await page.locator('#menu').click();assert.equal(await page.locator('#menu').getAttribute('aria-expanded'),'true');await page.locator('#large-text').click();await page.reload();assert.equal(await page.locator('#large-text').getAttribute('aria-pressed'),'true');await page.locator('#large-text').click();
 await page.goto(base+'/scores/');await page.locator('#name-filter').fill('Al DeMarco');assert.equal(await page.locator('#results tbody tr').count(),1);assert.match(await page.locator('#results tbody').innerText(),/200/);await page.locator('#name-filter').fill('No such shooter');assert.equal(await page.locator('#results tbody tr').count(),0);
 await page.goto(base+'/events/');await page.locator('#event-month').fill('2026-11');assert.ok(await page.locator('[data-month="2026-11"]:visible').count()>0);assert.equal(await page.locator('[data-month="2026-10"]:visible').count(),0);
 await page.goto(base+'/search/?q=membership');assert.ok(await page.locator('#search-results li:visible').count()>0);await page.locator('#content-search').fill('No such club page 123456');assert.equal(await page.locator('#search-results li:visible').count(),0);
 await page.goto(base+'/');await page.setViewportSize({width:1280,height:900});await page.locator('.footer').scrollIntoViewIfNeeded();await page.locator('.footer').screenshot({path:'docs/footer.png'});
 assert.deepEqual(errors,[]);console.log('PASS: mobile routes, navigation, persistent text size, scores, calendar and search');
}finally{await browser.close()}
