
const executeBrewScript = (api, subScript)=> {
	const functionWithFakeFile = `${subScript.gen}
//# sourceURL=Homebrewery_Script:_${subScript.name.replace(/\s+/g, "-")}
`;
    try {
    	const callbackFunction = new Function("api", functionWithFakeFile);
    	callbackFunction(api);
    } catch (error) {
        // This only fixes line counts on execution errors, not yet format errors
        error.stack = error.stack.replace(/(Homebrewery_Script:[^\n]+:)([0-9]+):([0-9]+)\)/,
            (match, preLineNumber, lineNumber, colNumber, offset, string) => {
                const adjustedLineNumber = (+lineNumber) + subScript.lineNumber - 1;
                return `${preLineNumber}${adjustedLineNumber}:${colNumber})`;
            });
        throw error;
    }
};

class ScriptAPI {
    #editor;
    #editorProps;

    constructor(editor, editorProps) {
        this.#editor = editor;
        this.#editorProps = editorProps;
    }

    /**
     *  Get information from the captured editor
     **/
    getBetween(start, end) {
        //
    }

    getSelected() {
        //
    }

    /**
     *  Modify the captured editor
     **/
    replaceBetween(start, end, text) {
        this.#editor?.replaceBetween(start, end, text);
        this.#editorProps?.onBrewChange('text');
    }

    replaceSelected(text) {
        //
    }

    insertAfter(target, text) {
        //
    }

    appendToEnd(text) {
        //
    }

    /**
     *  Functions to grab external data
     **/
    readCSVFromFile() {
        return new Promise(resolve => {
            const onFileLoad = (e) => {
                uploadFileElement.removeEventListener("change", onFileLoad);
            
                const file = e.target.files[0];
                if (!file) return;
            
                const reader = new FileReader();
                reader.onload = (e) => {
                    var fileContent = e.target.result;
                    const { readString } = usePapaParse();
                    readString(fileContent, {
                        worker: true,
                        header: true,
                        complete: (results) => {
                            resolve(results);
                        }
                    });
                };
                reader.readAsText(file);
            };
        
            const uploadFileElement = document.getElementById('snippetUploadFile');
            uploadFileElement.addEventListener("change", onFileLoad);
            uploadFileElement.click();
        });
    }

    readCSVFromSheets(id, gid) {
        //
    }

    /**
     *  Meta-scripting functionality
     **/
    executeScript(scriptName) {
        //
    }
}

export {
    executeBrewScript
};
export default ScriptAPI;
