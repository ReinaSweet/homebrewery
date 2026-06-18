import { usePapaParse } from 'react-papaparse';

class ScriptValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        this.message = message;

        if (this.stack) {
            let seekRemoveToIndex = this.stack.indexOf("at ScriptAPIWorker");
            seekRemoveToIndex = this.stack.indexOf(")", seekRemoveToIndex);
            seekRemoveToIndex = this.stack.indexOf("at subScriptFunction", seekRemoveToIndex);
            this.stack = this.stack.substring(seekRemoveToIndex);
        }
    }
}

class ScriptAPIValidator {
    constructor() {}

    #validateTypes(fname, forwardArgs, types) {
        if (forwardArgs.length !== types.length) {
            throw new ScriptValidationError(`${fname} expects exactly ${types.length} arguments`);
        }
        for (let i = 0; i < forwardArgs.length; ++i) {
            if (typeof forwardArgs[i] !== types[i]) {
                let argTypes = [];
                for (let arg of forwardArgs) {
                    argTypes.push(typeof arg);
                }
                throw new ScriptValidationError(`${fname} expects types ${types.toString()}, got ${argTypes} instead`);
            }
        }
        return true;
    }

    validateUntrustedFunction(fname, args) {
        if (typeof fname === "string") {
            if (fname.indexOf("do") === 0 || fname.indexOf("get") === 0) {
                if (typeof this[fname] === "function") {
                    if (Array.isArray(args)) {
                        return this[fname].apply(this, args);
                    } else {
                        return this[fname].apply(this, []);
                    }
                }
            }
        }
        return false;
    }

    /**
     * validate 'get' functions
     */
    getBetween(...args) {
        if (!this.#validateTypes("getBetween", args, ["string", "string"])) {
            return false;
        }
        return true;
    }

    getCSVFromFile() { return true; }

    getCSVFromSheets(...args) {
        if (!this.#validateTypes("getCSVFromSheets", args, ["string", "number"])) {
            return false;
        }

        if (args[0].match(/[^\-a-z0-9_]/i)) {
            throw new ScriptValidationError(`getCSVFromSheets URL is ill-formed`);
        }
        return true;
    }

    /**
     * validate 'do' functions
     */
    doReplaceBetween(...args) {
        if (!this.#validateTypes("doReplaceBetween", args, ["string", "string", "string"])) {
            return false;
        }
        return true;
    }

    doReplaceSelected(...args) {
        if (!this.#validateTypes("doReplaceSelected", args, ["string"])) {
            return false;
        }
        return true;
    }

    doAppendToStart(...args) {
        if (!this.#validateTypes("doAppendToStart", args, ["string"])) {
            return false;
        }
        return true;
    }

    doAppendToEnd(...args) {
        if (!this.#validateTypes("doAppendToEnd", args, ["string"])) {
            return false;
        }
        return true;
    }

    /**
     * validate utility 'do' functions
     */
    doReportError(...args) {
        if (!this.#validateTypes("doReportError", args, ["string", "string"])) {
            return false;
        }
        return true;
    }
};

class ScriptAPIWorker {
    #context;
    #validator = new ScriptAPIValidator();

    constructor(context, subScriptFunction) {
        this.#context = context;
        
        const self = this;
        const listenForStart = (event) => {
            if (event.data.fname === "start") {
                context.removeEventListener("message", listenForStart);
                try {
                    subScriptFunction(self);
                } catch (error) {
                    const stack = error.stack.substring(0, error.stack.lastIndexOf(" at listenForStart"));
                    self.doReportError(error.message, stack);
                }
            }
        };

        this.#context.addEventListener("message", listenForStart);
    }

    #post(name, forwardArgs) {
        this.#context.postMessage({
            fname: name,
            args: forwardArgs
        });
    }

    #postAndExpect(name, forwardArgs) {
        let context = this.#context;
        return new Promise((resolve) => {
            const responseHandler = (event) => {
                if (event.data.fname === ("r:" + name)) {
                    context.removeEventListener("message", responseHandler);
                    resolve(event.data.data);
                }
            };
            context.addEventListener("message", responseHandler);
            context.postMessage({
                fname: name,
                args: forwardArgs
            });
        });
    }

    /**
     * Send to main thread 'get' functions and expect a promise
     */
    getBetween(start, end) {
        if (this.#validator.getBetween(start, end)) {
            return this.#postAndExpect("getBetween", [start, end]);
        }
        return null;
    }

    getCSVFromFile() {
        return this.#postAndExpect("getCSVFromFile", []);
    }

    getCSVFromSheets(sheetId, gid = 0) {
        if (this.#validator.getCSVFromSheets(sheetId, gid)) {
            return this.#postAndExpect("getCSVFromSheets", [sheetId, gid]);
        }
        return null;
    }

    /**
     * Send to main thread 'do' functions
     */
    doReplaceBetween(start, end, text) {
        if (this.#validator.doReplaceBetween(start, end, text)) {
            this.#post("doReplaceBetween", [start, end, text]);
        }
    }

    doReplaceSelected(text) {
        if (this.#validator.doReplaceSelected(text)) {
            this.#post("doReplaceSelected", [text]);
        }
    }

    doAppendToStart(text) {
        if (this.#validator.doAppendToStart(text)) {
            this.#post("doAppendToStart", [text]);
        }
    }

    doAppendToEnd(text) {
        if (this.#validator.doAppendToEnd(text)) {
            this.#post("doAppendToEnd", [text]);
        }
    }

    /**
     * Utilities, should all be 'do' or not talk at all to the ScriptAPI
     */
    doReportError(message, stack = "") {
        if (this.#validator.doReportError(message, stack)) {
            return this.#post("doReportError", [message, stack]);
        }
        return null;
    }
};

class ScriptAPI {
    #scriptName = "";
    #scriptLineNumber = 0;
    #scriptBlobURL = "";

    #codeEditor;
    #editor;
    #worker;

    #validator = new ScriptAPIValidator();
    #pauseStandardTimeoutCount = 0;
    #unpauseStandardTimeoutCount = 0;

    constructor(codeEditor, editor) {
        this.#codeEditor = codeEditor;
        this.#editor = editor;
    }

    /**
     *  Starts the user script as a worker and starts listening to messages from it
     **/
    start(subScript) {
        this.terminateWorker();

        this.#scriptName = subScript.name;
        this.#scriptLineNumber = subScript.lineNumber;

        // Start the subscript specifically on line 2
        // This lines up the Editor gutter line numbers with anything that errors or console logs
        const blobText = `'use strict';
const subScriptFunction = (api)=>{${subScript.gen}
};

${ScriptValidationError.toString()};
${ScriptAPIValidator.toString()};
${ScriptAPIWorker.toString()};
const workerAPI = new ScriptAPIWorker(self, subScriptFunction);
`;
        try {
            const blob = new Blob([blobText], {type: 'application/javascript'});
            this.#scriptBlobURL = URL.createObjectURL(blob);
            this.#worker = new Worker(this.#scriptBlobURL, {
                credentials: 'omit',
                name: this.#scriptName
            });

            const scriptAPIself = this;
            this.#worker.addEventListener("message", (event) => {
                scriptAPIself.onWorkerMessage(event);
            });
            this.#worker.addEventListener("error", (event) => {
                scriptAPIself.onWorkerError(event);
            });
            this.#worker.postMessage({ fname: "start" });
            this.terminateAfterTimeout();
        } catch (error) {
            this.doReportError(error.message, error.stack);
        }
    }

    onWorkerMessage(event) {
        if (typeof event.data === "object" && this.#validator.validateUntrustedFunction(event.data.fname, event.data.args)) {
            if (event.data.fname.indexOf("do") === 0) {
                this[event.data.fname].apply(this, event.data.args);
            
            } else if (event.data.fname.indexOf("get") === 0) {
                const promise = this[event.data.fname].apply(this, event.data.args);
                const scriptAPIself = this;
                const worker = this.#worker;

                this.#pauseStandardTimeoutCount += 1;
                promise.then((data) => {
                    scriptAPIself.#unpauseStandardTimeoutCount += 1;
                    worker.postMessage({
                        fname: "r:" + event.data.fname,
                        data: data
                    });
                });
            }
        }
    }

    onWorkerError(event) {
        if (!event.isTrusted) return;

        // This should be SyntaxErrors, since we catch execution errors in a different path
        // Worker SyntaxErrors don't have a stack, so, we have to manually format it
        const adjustedLineNumber = event.lineno + this.#scriptLineNumber;
        const stack = `${this.#scriptName}:${adjustedLineNumber}:${event.colno}`;

        this.#editor?.updateScriptRequest({
            type: "reporterror",
            message: event.message,
            stack: stack,
            scriptName: this.#scriptName
        });
    }

    terminateAfterTimeout() {
        let scriptAPIself = this;
        setTimeout(() => {
            scriptAPIself.terminateWorkerIfUnpausedOrTimeout();
        }, 2000);
    }

    terminateWorker() {
        if (this.#worker) {
            this.#worker.terminate();
            this.#worker = null;
        }
    }

    terminateWorkerIfUnpausedOrTimeout() {
        if (this.#pauseStandardTimeoutCount > 0) {
            this.#pauseStandardTimeoutCount -= this.#unpauseStandardTimeoutCount;
            this.#unpauseStandardTimeoutCount = 0;
            this.terminateAfterTimeout();
        } else {
            this.terminateWorker();
        }
    }

    /**
     *  Get data to be returned to the worker script
     *  get Functions must always return a Promise
     **/
    getBetween(start, end) {
        return new Promise((resolve) => {
            const textBetween = this.#codeEditor?.getBetween(start, end);
            resolve(textBetween);
        });
    }

    getSelected() {
        //
    }
    
    getCSVFromFile() {
        return new Promise((resolve) => {
            this.#editor?.updateScriptRequest({
                type: "uploadfile",
                message: "Upload a CSV",
                callback: (e) => {
                    const fileContent = e.target.result;
                    const { readString } = usePapaParse();
                    readString(fileContent, {
                        worker: true,
                        header: true,
                        complete: (results) => {
                            resolve(results);
                        }
                    });
                }
            });
        });
    }

    getCSVFromSheets(sheetId, gid) {
        return new Promise((resolve) => {
            const URL = `https://docs.google.com/spreadsheets/d/e/${sheetId}/pub?gid=${gid}&single=true&output=csv`;
            this.#editor?.updateScriptRequest({
                type: "readurl",
                message: "Read sheets CSV from URL:",
                URL: URL,
                callback: () => {
                    const { readRemoteFile } = usePapaParse();
                    readRemoteFile(URL, {
                        download: true,
                        header: true,
                        complete: (results) => {
                            resolve(results);
                        }
                    });
                }
            });
        });
    }

    /**
     *  Modifies the captured editor
     **/
    doReplaceBetween(start, end, text) {
        this.#codeEditor?.replaceBetween(start, end, text);
    }

    doReplaceSelected(text) {
        this.#codeEditor?.injectText(text);
    }

    doInsertAfter(target, text) {
        //
    }

    doAppendToStart(text) {
        this.#codeEditor?.insertAt(0, text);
    }

    doAppendToEnd(text) {
        const codeSize = this.#codeEditor?.getCurrentLength();
        this.#codeEditor?.insertAt(codeSize, text);
    }

    /**
     * Utilities, meta information
     * None should do any actual modifications
     */
    doReportError(message, stack) {
        stack = stack.replaceAll(this.#scriptBlobURL, this.#scriptName);
        this.#editor?.updateScriptRequest({
            type: "reporterror",
            message: message,
            stack: stack,
            scriptName: this.#scriptName
        });
    }
}

const executeBrewScript = (api, subScript)=> {
    if (api instanceof ScriptAPI) {
        api.start(subScript);
    }
};

export {
    executeBrewScript
};
export default ScriptAPI;
