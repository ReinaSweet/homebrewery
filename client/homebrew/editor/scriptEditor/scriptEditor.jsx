import { usePapaParse } from 'react-papaparse';

class ScriptValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        this.message = message;
    }
}

class ScriptAPIValidator {
    constructor() {}

    #validateTypes(fname, forwardArgs, types, numOptional = 0) {
        let undefinedArgCount = 0;
        for (let arg of forwardArgs) {
            if (arg === undefined) {
                ++undefinedArgCount;
            }
        }

        const excessArgs = forwardArgs.pop();
        const argsLength = forwardArgs.length + (Array.isArray(excessArgs) ? excessArgs.length : 0) - undefinedArgCount;
        if (argsLength !== types.length) {
            if (numOptional < 1) {
                const message = `${fname} expects exactly ${types.length} arguments, got ${argsLength} instead`;
                throw new ScriptValidationError(message);
            } else {
                const message = `${fname} expects between ${types.length - numOptional} and ${types.length} arguments, got ${argsLength} instead`;
                throw new ScriptValidationError(message);
            }
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
                        args.push(args.length);
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

    getSelected(...args) {
        if (!this.#validateTypes("getSelected", args, [])) {
            return false;
        }
        return true;
    }

    getCSVFromFile(...args) {
        if (!this.#validateTypes("getCSVFromFile", args, ["string"], 1)) {
            return false;
        }
        return true;
    }

    getCSVFromSheets(...args) {
        if (!this.#validateTypes("getCSVFromSheets", args, ["string", "number", "string"], 2)) {
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

    doInsertAfter(...args) {
        if (!this.#validateTypes("doInsertAfter", args, ["string", "string"])) {
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
        if (!this.#validateTypes("doReportError", args, ["string", "string"], 1)) {
            return false;
        }
        return true;
    }
};

class ScriptAPIDeferrable {
    #worker;
    #promise;
    #resolved = false;
    #callbacks = [];
    #data = null;

    constructor(worker, resolver) {
        this.#worker = worker;
        const self = this;

        this.#promise = new Promise(resolver).catch((error) => {
            worker.doReportError(error.message, error.stack);
        }).then((data) => {
            self.resolve(data);
        });
    }

    #singlecall(callback) {
        try {
            callback(this.#data);
        } catch (error) {
            this.#worker.doReportError(error.message, error.stack);
        }
    }
    
    then(callback) {
        if (this.#resolved) {
            this.#singlecall(callback);
        } else {
            this.#callbacks.push(callback);
        }
        return this;
    }

    resolve(data) {
        if (this.#resolved) { throw new Error("Attempting to resolve thenable multiple times"); }
        this.#resolved = true;
        this.#data = data;
        for (let callback of this.#callbacks) {
            this.#singlecall(callback);
        }
        this.#callbacks = [];
    }
}

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
                    self.doReportError(error.message, error.stack);
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
        const context = this.#context;
        return new ScriptAPIDeferrable(this, (resolve) => {
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
    getBetween(start, end, ...args) {
        if (this.#validator.getBetween(start, end, args)) {
            return this.#postAndExpect("getBetween", [start, end]);
        }
        return null;
    }

    getSelected(...args) {
        if (this.#validator.getSelected(args)) {
            return this.#postAndExpect("getSelected", []);
        }
        return null;
    }

    getCSVFromFile(message = "", ...args) {
        if (this.#validator.getCSVFromFile(message, args)) {
            return this.#postAndExpect("getCSVFromFile", [message]);
        }
        return null;
    }

    getCSVFromSheets(sheetId, gid = 0, message = "", ...args) {
        if (this.#validator.getCSVFromSheets(sheetId, gid, message, args)) {
            return this.#postAndExpect("getCSVFromSheets", [sheetId, gid, message]);
        }
        return null;
    }

    /**
     * Send to main thread 'do' functions
     */
    doReplaceBetween(start, end, text, ...args) {
        if (this.#validator.doReplaceBetween(start, end, text, args)) {
            this.#post("doReplaceBetween", [start, end, text]);
        }
    }

    doReplaceSelected(text, ...args) {
        if (this.#validator.doReplaceSelected(text, args)) {
            this.#post("doReplaceSelected", [text]);
        }
    }

    doInsertAfter(target, text, ...args) {
        if (this.#validator.doInsertAfter(target, text, args)) {
            this.#post("doInsertAfter", [target, text]);
        }
    }

    doAppendToStart(text, ...args) {
        if (this.#validator.doAppendToStart(text, args)) {
            this.#post("doAppendToStart", [text]);
        }
    }

    doAppendToEnd(text, ...args) {
        if (this.#validator.doAppendToEnd(text, args)) {
            this.#post("doAppendToEnd", [text]);
        }
    }

    /**
     * Utilities, should all be 'do' or not talk at all to the ScriptAPI
     */
    doReportError(message, stack = "", ...args) {
        if (this.#validator.doReportError(message, stack, args)) {
            return this.#post("doReportError", [message, stack]);
        }
        return null;
    }
};

class ScriptAPI {
    #scriptName = "";
    #linesStart = 0;
    #scriptBlobURL = "";
    #linesEnd = 0;

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
        this.#linesStart = subScript.linesStart;
        this.#linesEnd = subScript.linesEnd;

        // Start the subscript specifically on line 2
        // This lines up the Editor gutter line numbers with anything that errors or console logs
        const blobText = `'use strict';
const subScriptFunction = (api)=>{${subScript.gen}
};

${ScriptValidationError.toString()};
${ScriptAPIValidator.toString()};
${ScriptAPIDeferrable.toString()};
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
        const adjustedLineNumber = event.lineno + this.#linesStart;
        const stack = `${event.message}
    at ${this.#scriptName}:${adjustedLineNumber}:${event.colno}`;

        this.#editor?.updateScriptRequest({
            type: "reporterror",
            message: event.message,
            stack: stack,
            scriptName: this.#scriptName,
            persistAcrossTabs: true
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
        return new Promise((resolve) => {
            const selection = this.#codeEditor?.getCursorSelection();
            resolve(selection);
        });
    }
    
    getCSVFromFile(message) {
        return new Promise((resolve) => {
            this.#editor?.updateScriptRequest({
                type: "uploadfile",
                title: "Script Request: Upload CSV from File",
                message: message,
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

    getCSVFromSheets(sheetId, gid, message) {
        return new Promise((resolve) => {
            const URL = `https://docs.google.com/spreadsheets/d/e/${sheetId}/pub?gid=${gid}&single=true&output=csv`;
            this.#editor?.updateScriptRequest({
                type: "readurl",
                title: "Script Request: Read CSV from URL",
                message: message,
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
        const position = this.#codeEditor?.getPositionOf(target);
        if (position > -1) {
            this.#codeEditor?.insertAt(position + target.length, text);
        }
    }

    doAppendToStart(text) {
        this.#codeEditor?.insertAt(0, text);
    }

    doAppendToEnd(text) {
        const position = this.#codeEditor?.getCurrentLength();
        this.#codeEditor?.insertAt(position, text);
    }

    /**
     * Utilities, meta information
     * None should do any actual modifications
     */
    doReportError(message, stack) {
        // We do a lot of filtering to make this more usable to non-technical users,
        // So give an unfiltered error to technical users in the console
        console.error(stack);

        const stackLineRegex = /^(?<desc>\s+at .+):(?<lineno>\d+):(?<colno>\d+)(?<end>\)?)$/;
        const sourceStackLines = stack.split('\n');

        let targetStackLines = [sourceStackLines.shift()];
        for (const line of sourceStackLines) {
            const lineMatch = line.match(stackLineRegex);
            if (lineMatch) {
                const adjustedLineno = parseInt(lineMatch.groups.lineno) + this.#linesStart;
                // Only include lines that would be part of the user written script
                if (adjustedLineno < this.#linesEnd) {
                    const adjustedDesc = lineMatch.groups.desc.replaceAll(this.#scriptBlobURL, this.#scriptName);
                    const newStackLine = `${adjustedDesc}:${adjustedLineno}:${lineMatch.groups.colno}${lineMatch.groups.end}`;
                    targetStackLines.push(newStackLine);
                }
            }
        }

        const newStack = targetStackLines.join('\n');
        this.#editor?.updateScriptRequest({
            type: "reporterror",
            message: message,
            stack: newStack,
            scriptName: this.#scriptName,
            persistAcrossTabs: true
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
