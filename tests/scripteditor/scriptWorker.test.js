
import { ScriptAPIWorker, ScriptAPIDeferrable, makeBrewScriptWorkerText } from '../../shared/scriptWorker.js';
import { brewScriptsToJSON, getSingleScriptFromText } from '../../shared/helpers.js';

const ContextFacade = class {
    #optionalEvent;
    #response;
    constructor(response) {
        this.#response = response;
    }

    addEventListener(name, callback) {
        this.#optionalEvent = callback;
    }

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

const runBrewWorkerGet = (command) => {
    return new Promise((resolve, reject) => {
        const deferredWrapper = new ScriptAPIDeferrable().then(res => {
            console.log(res);
            resolve(res);
        });
        const context = new ContextFacade((data) => {
            deferredWrapper.resolve(data);
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

test('Verify a response for doReplaceBetween', async ()=>{
    const data = await runBrewWorker((api) => {
        api.doReplaceBetween("start", "end", "testmessage");
    });

    expect(data.fname).toBe('doReplaceBetween');
});

test('Verify a response for doReplaceSelected', async ()=>{
    const data = await runBrewWorker((api) => {
        api.doReplaceSelected("testmessage");
    });

    expect(data.fname).toBe('doReplaceSelected');
});

test('Verify a response for doInsertAfter', async ()=>{
    const data = await runBrewWorker((api) => {
        api.doInsertAfter("target", "testmessage");
    });

    expect(data.fname).toBe('doInsertAfter');
});

test('Verify a response for doAppendToStart', async ()=>{
    const data = await runBrewWorker((api) => {
        api.doAppendToStart("testmessage");
    });

    expect(data.fname).toBe('doAppendToStart');
});

test('Verify a response for doAppendToEnd', async ()=>{
    const data = await runBrewWorker((api) => {
        api.doAppendToEnd("testmessage");
    });

    expect(data.fname).toBe('doAppendToEnd');
});

test('Verify a response for doReportError', async ()=>{
    const data = await runBrewWorker((api) => {
        api.doReportError("errormessage");
    });

    expect(data.fname).toBe('doReportError');
});

test('Verify a response for getBetween', async ()=>{
    const data = await runBrewWorkerGet((api) => {
        return api.getBetween("start", "end");
    });

    expect(data.fname).toBe('getBetween');
});

test('brewScriptsToJSON can run at all', async ()=>{
    const data = brewScriptsToJSON("testmenu", `

`);
    expect(data.scripts.length).toBe(0);
});
