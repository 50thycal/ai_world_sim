import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const code=readFileSync(new URL('../public/theme.js',import.meta.url),'utf8');
function fixture(saved,blocked=false){
 const listeners={},clicks={},attrs={},meta={};const root={dataset:{}};const button={setAttribute:(k,v)=>attrs[k]=v,addEventListener:(k,v)=>clicks[k]=v};
 const storage={getItem(){if(blocked)throw Error('Storage blocked');return saved;},setItem(k,v){if(blocked)throw Error('Storage blocked');saved=v;}};
 vm.runInNewContext(code,{document:{documentElement:root,querySelector:()=>({setAttribute:(k,v)=>meta[k]=v}),getElementById:()=>button,addEventListener:(k,v)=>listeners[k]=v},localStorage:storage});
 return{root,button,attrs,meta,ready:()=>listeners.DOMContentLoaded(),click:()=>clicks.click(),saved:()=>saved};
}
test('dark mode applies before DOM readiness and preserves an explicit light preference',()=>{
 const dark=fixture();assert.equal(dark.root.dataset.theme,'dark');assert.equal(dark.meta.content,'#111a17');dark.ready();assert.equal(dark.attrs['aria-label'],'Switch to light mode');dark.click();assert.equal(dark.saved(),'light');assert.equal(dark.root.dataset.theme,'light');
 const light=fixture(dark.saved());assert.equal(light.root.dataset.theme,'light');light.ready();light.click();assert.equal(light.saved(),'dark');assert.equal(light.attrs['aria-label'],'Switch to light mode');
});
test('blocked storage still allows theme switching and an invalid saved value defaults to dark',()=>{
 const blocked=fixture(null,true);blocked.ready();blocked.click();assert.equal(blocked.root.dataset.theme,'light');blocked.click();assert.equal(blocked.root.dataset.theme,'dark');assert.equal(fixture('unexpected').root.dataset.theme,'dark');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.ok(html.indexOf('/theme.js')<html.indexOf('/style.css'));assert.match(html,/<html[^>]*data-theme="dark"/);
});
