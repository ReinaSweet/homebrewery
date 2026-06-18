import '../../brewRenderer/notificationPopup/notificationPopup.less';
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
                const file = e.target.files[0];
                if (!file) return;
            
                const reader = new FileReader();
                reader.onload = (e) => {
                    props.request.callback(e);
                };
                reader.readAsText(file);
                dismissScriptRequest();
            };

	        return <Dialog className='notificationPopup' closeText='Cancel' onDismiss={dismissScriptRequest} >
	        	<h1>{props.request.message}</h1>
	        	<p></p>
			    <button className='uploadFile' onClick={()=>{ document.getElementById('scriptRequestFile').click(); }}>Upload File</button>
				<input id='scriptRequestFile' className='newFromLocal' type='file' onChange={onFileLoad} style={{ display: 'none' }} />
	        	<hr />
	        	<p>If you wish to ignore this, click Cancel.</p>
	        </Dialog>;
        }
        
        case "readurl": {
            const onURLCommitted = () => {
                props.request.callback();
                dismissScriptRequest();
            };

	        return <Dialog className='notificationPopup' closeText='Cancel' onDismiss={dismissScriptRequest} >
	        	<h1>{props.request.message}</h1>
                <p>{props.request.URL}</p>
	        	<p></p>
			    <button className='uploadFile' onClick={onURLCommitted}>Allow URL Read</button>
	        	<hr />
	        	<p>If you wish to ignore this, click Cancel.</p>
	        </Dialog>;
        }

        case "reporterror": {
	        return <Dialog className='notificationPopup' closeText='Close' onDismiss={dismissScriptRequest} >
	        	<h1>Script Error: {props.request.message}</h1>
                <p>{props.request.scriptName}:{props.request.scriptLineNumber}</p>
                <p>{props.request.stack}</p>
	        </Dialog>;
        }

        default: break;
    }
    return null;

};

export default ScriptRequestNotification;
