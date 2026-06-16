
const executeBrewScript = (api, subScript)=> {
	const functionWithFakeFile = `${subScript.gen}
//# sourceURL=Homebrewery_Script:_${subScript.name.replace(/\s+/g, "-")}
`;
    try {
    	const callbackFunction = new Function("api", functionWithFakeFile);
    	callbackFunction(api);
    } catch (error) {
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
