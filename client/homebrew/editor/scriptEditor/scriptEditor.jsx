
class ScriptAPI {
    #editor;

    constructor(editor) {
        this.#editor = editor;
    }

    replaceBetween(start, end, text) {
        this.#editor?.replaceBetween(start, end, text);
    }

    getSelected() {
        //
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

    executeScript(scriptName) {
        //
    }
}

export default ScriptAPI;
