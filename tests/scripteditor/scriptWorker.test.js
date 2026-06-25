
import { makeBrewScriptWorkerText } from '../../shared/scriptWorker.js';

test('BrewScripts can generate any kind of script without hitting an error', ()=>{
	const rawscript = makeBrewScriptWorkerText('');
	const useStrictLead = `'use strict';`;
	const reducedScript = rawscript.substring(0, useStrictLead.length);

	expect(reducedScript).toBe(useStrictLead);
});

