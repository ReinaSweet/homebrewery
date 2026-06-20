import './scriptRequestNotification.less';
import * as React from 'react';
import Dialog from '../../../components/dialog.jsx';

const ScriptRequestNotification = (props) => {
    if (props.request === null) return null;

    const dismissScriptRequest = () => {
        if (props.updateScriptRequest) {
            props.updateScriptRequest(null);
        }
    };

    switch (props.request.type) {
        case "uploadfile": {
            const onFileLoad = (e) => {
                dismissScriptRequest();

                const file = e.target.files[0];
                if (!file) return;
            
                const reader = new FileReader();
                reader.onload = (e) => {
                    props.request.callback(e);
                };
                reader.readAsText(file);
            };

	        return <Dialog className='scriptRequestNotification' closeText='Cancel' onDismiss={dismissScriptRequest} >
	        	<h1>{props.request.title}</h1>
	        	<p>{props.request.message}</p>
			    <button className='uploadFile' onClick={()=>{ document.getElementById('scriptRequestFile').click(); }}>Select File</button>
				<input id='scriptRequestFile' className='newFromLocal' type='file' onChange={onFileLoad} style={{ display: 'none' }} />
	        	<hr />
	        	<p>If you wish to ignore this, click Cancel.</p>
	        </Dialog>;
        }
        
        case "readurl": {
            const onURLCommitted = () => {
                dismissScriptRequest();
                
                props.request.callback();
            };

	        return <Dialog className='scriptRequestNotification' closeText='Cancel' onDismiss={dismissScriptRequest} >
	        	<h1>{props.request.title}</h1>
                <p>{props.request.message}</p>
                <small>{props.request.URL}</small>
			    <button className='commitURL' onClick={onURLCommitted}>Allow URL Read</button>
	        	<hr />
	        	<p>If you wish to ignore this, click Cancel.</p>
	        </Dialog>;
        }

        case "reporterror": {
	        return <Dialog className='scriptRequestError' closeText='Close' onDismiss={dismissScriptRequest} >
	        	<h1>Script Error in: {props.request.scriptName}</h1>
                <p>{props.request.message}</p>
                <code>{props.request.stack.trim()}</code>
	        </Dialog>;
        }

        default: break;
    }
    return null;

};

export default ScriptRequestNotification;
