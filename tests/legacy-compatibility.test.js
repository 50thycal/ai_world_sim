import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { newWorld, observation, assign, advance, demoDecision, decisionSchema } from '../src/world.js';

// Captured from release commit 067c63a3239af712b24215f89048b1ec03d71e3b before v10 edits.
// These old treatments retain their exact schemas, inputs and outcomes. Put intended rule changes
// in a new treatment instead of regenerating historical expectations from changed implementation.
const expected = {"world-v4": "50b0b98c01fb7a2d43b0a8993ff0785084c75b51c577575e6bf131d4bd568f80", "world-v5": "f5ba40dc607ed7d624f063c3aa08654b98368b7c160d46e1fc8d990607905c94", "world-v6": "db8ce873c89a7d9285f7d15da69a179636c3d5499d0f8c2bf65dbba0955016e8", "world-v7": "1e8498cafd28cb39a1db7dfb896a69319508d1aab8884f710a7557b614dbcb8d", "world-v8": "afc3c21eee6bbf310640a3ca0b78f2ef6032695e23894abb5239937ac6d53ee5", "world-v9": "4996c1221c09a98d67d2c4d5afd48b4cbf5000f4d5fe1797662b29a76475920f"};
test('v4 through v9 retain the released schemas, observations and physical outcomes',()=>{
  for(const flags of [{},{economy:true},{village:true},{life:true},{coordination:true},{community:true}]) {
    const w=newWorld('demo',null,{scenario:'sustainable',socialStart:false,...flags});
    w.id='same';w.created='same';const hash=createHash('sha256'),add=x=>hash.update(JSON.stringify(x));
    add(decisionSchema(w.version));
    for(let tick=0;tick<400;tick++) {
      if(tick%12===0)for(const a of w.agents){add(observation(w,a));assign(w,a,demoDecision(w,a));}
      add(advance(w));add(w);
    }
    assert.equal(hash.digest('hex'),expected[w.version],w.version);
  }
});
