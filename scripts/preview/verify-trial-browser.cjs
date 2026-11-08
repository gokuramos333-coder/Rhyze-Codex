const { chromium } = require('playwright');
const fs = require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const results=[];
 for(const width of [1440,768,320]){
  const page=await browser.newPage({viewport:{width,height:1100}});
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:52491');
  await page.waitForSelector('select');
  const result=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,text:document.body.innerText,enabledCheckout:[...document.querySelectorAll('button')].some(b=>/checkout|email/i.test(b.textContent)&&!b.disabled)}));
  if(result.documentWidth>width || result.enabledCheckout || !result.text.includes('NONPRODUCTION')) throw Error(JSON.stringify(result));
  await page.screenshot({path:`../evidence/preview-${width}.png`,fullPage:true});
  results.push(result);await page.close();
 }
 await browser.close();
 fs.writeFileSync('../evidence/browser-verification.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(({text,...r})=>r)));
})().catch(e=>{console.error(e);process.exit(1)});
