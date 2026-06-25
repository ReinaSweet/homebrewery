
import { ScriptAPIWorker, makeBrewScriptWorkerText } from '../../shared/scriptWorker.js';

const ContextFacade = class {
    #response;
    constructor(response) {
        this.#response = response;
    }

    addEventListener() {}
    removeEventListener() {}

    postMessage(data) {
        return this.#response(data);
    }
};

const runBrewWorker = (command) => {
    return new Promise((resolve, reject) => {
        const context = new ContextFacade((data) => {
            resolve(data);
        });
        const api = new ScriptAPIWorker(context);
        command(api);
    });
};

test('BrewScripts can generate any kind of script without hitting an error', ()=>{
	const rawscript = makeBrewScriptWorkerText('');
	const useStrictLead = `'use strict';`;
	const reducedScript = rawscript.substring(0, useStrictLead.length);

	expect(reducedScript).toBe(useStrictLead);
});

test('We can start a ScriptAPIWorker and fake postMessage', async ()=>{
    const data = await runBrewWorker((api) => {
        api.doReplaceBetween("start", "end", "testmessage");
    });

    expect(data.fname).toBe('doReplaceBetween');
});