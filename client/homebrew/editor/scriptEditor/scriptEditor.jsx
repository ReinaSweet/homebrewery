import { usePapaParse } from 'react-papaparse';

class ScriptAPIValidator {
    constructor() {}

    #validateTypes(forwardArgs, types) {
        if (forwardArgs.length !== types.length) {
            throw new Error(`ERROR expected exactly ${types.length} arguments`);
        }
        for (let i = 0; i < forwardArgs.length; ++i) {
            if (typeof forwardArgs[i] !== types[i]) {
                throw new Error(`ERROR types don't match expected types from arguments`);
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

    doReplaceBetween(...args) {
        if (!this.#validateTypes(args, ["string", "string", "string"])) {
            return false;
        }
        return true;
    }

    getCSVFromFile() { return true; }
};

class ScriptAPIWorker {
    #context;
    #validator = new ScriptAPIValidator();

    constructor(context) {
        this.#context = context;
    }

    secureGlobal(global) {
        const wl = {
            "self": 1,
            "global": 1,

            "addEventListener": 1,
            "removeEventListener": 1,
            "postMessage": 1,
            "eval": 1,
            "Array": 1,
            "Boolean": 1,
            "Date": 1,
            "Function": 1,
            "Number" : 1,
            "Object": 1,
            "RegExp": 1,
            "String": 1,
            "Error": 1,
            "EvalError": 1,
            "RangeError": 1,
            "ReferenceError": 1,
            "SyntaxError": 1,
            "TypeError": 1,
            "isFinite": 1,
            "isNaN": 1,
            "parseFloat": 1,
            "parseInt": 1,
            "Infinity": 1,
            "JSON": 1,
            "Math": 1,
            "NaN": 1,
            "undefined": 1,
            "TEMPORARY": 1,
            "PERSISTENT": 1,
            "console": 1,
            "Promise": 1,
            "ScriptAPIWorker": 1,
            "ScriptAPIValidator": 1
        };

        Object.getOwnPropertyNames( global ).forEach( function( prop ) {
            if( !wl.hasOwnProperty( prop ) ) {
                Object.defineProperty( global, prop, {
                    get : function() {
                        throw new Error( "Security Exception: cannot access "+prop);
                        return 1;
                    }, 
                    configurable : false
                });    
            }
        });

        Object.getOwnPropertyNames( global.__proto__ ).forEach( function( prop ) {
            if( !wl.hasOwnProperty( prop ) ) {
                Object.defineProperty( global.__proto__, prop, {
                    get : function() {
                        throw new Error( "Security Exception: cannot access "+prop);
                        return 1;
                    }, 
                    configurable : false
                });    
            }
        });
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

    doReplaceBetween(start, end, text) {
        if (this.#validator.doReplaceBetween(start, end, text)) {
            this.#post("doReplaceBetween", [start, end, text]);
        }
    }

    getCSVFromFile() {
        return this.#postAndExpect("getCSVFromFile", []);
    }
};

class ScriptAPI {
    #editor;
    #editorProps;
    #worker;

    #validator = new ScriptAPIValidator();
    #pauseStandardTimeoutCount = 0;
    #unpauseStandardTimeoutCount = 0;

    constructor(editor, editorProps) {
        this.#editor = editor;
        this.#editorProps = editorProps;
    }

    /**
     *  Starts the user script as a worker and starts listening to messages from it
     **/
    start(subScript) {
        this.terminateWorker();

        const blobText = `
const subScriptFunction = (api)=>{
    ${subScript.gen}
};

${ScriptAPIValidator.toString()};
${ScriptAPIWorker.toString()};

const workerAPI = new ScriptAPIWorker(self);
workerAPI.secureGlobal(this);
self.addEventListener("message", (event) => {
    if (event.data.fname === "start") {
        subScriptFunction(workerAPI);
    }
});
`;
        const blob = new Blob([blobText], {type: 'application/javascript'});
        this.#worker = new Worker(URL.createObjectURL(blob));

        const scriptAPIself = this;
        this.#worker.addEventListener("message", (event) => {
            scriptAPIself.onWorkerMessage(event);
        });
        this.#worker.postMessage({ fname: "start" });
        this.terminateAfterTimeout();
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
        //
    }

    getSelected() {
        //
    }
    
    getCSVFromFile() {
        return new Promise((resolve) => {
            this.#editorProps?.onScriptRequest({
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

    /**
     *  Modifies the captured editor
     **/
    doReplaceBetween(start, end, text) {
        this.#editor?.replaceBetween(start, end, text);
        this.#editorProps?.onBrewChange('text');
    }

    doReplaceSelected(text) {
        //
    }

    doInsertAfter(target, text) {
        //
    }

    doAppendToEnd(text) {
        //
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
