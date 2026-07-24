import React, { useState, useEffect } from 'react';
import Nav from './nav.jsx';
import { printCurrentBrew } from '@shared/helpers.js';
import { toPng, getFontEmbedCSS } from 'html-to-image';
import { zipSync } from 'fflate';

const DEFAULT_CSS_DPI = 100;

class BrewImageZip {
	#brewContainer;
	#dpi;
	#fileName;
	#fontEmbedCSS;

	#classNames = [];
	#activeNodes = 0;
	#zipData = {};
	#useContainerScale;

	constructor(useContainerScale) {
		const brewRenderer = document.getElementById('BrewRenderer');
		const brewRendererDoc = brewRenderer.contentDocument || brewRenderer.contentWindow.document;
		this.#brewContainer = brewRendererDoc.getElementById('brewContainer');
		this.#fontEmbedCSS = getFontEmbedCSS(this.#brewContainer);

		const brewContainerStyle = window.getComputedStyle(this.#brewContainer);
		this.#dpi = brewContainerStyle.getPropertyValue('--export-dpi') || DEFAULT_CSS_DPI;
		let fixedClassNames = brewContainerStyle.getPropertyValue('--export-class') || 'page';
		this.#fileName = brewContainerStyle.getPropertyValue('--export-file') || 'pages.zip';

		fixedClassNames = fixedClassNames.replace(/^\"([\w\d_,]+)\"$/i, '$1');
		this.#fileName = this.#fileName.replace(/^\"([\w\d_\.]+)\"$/i, '$1');

		if (!fixedClassNames.startsWith('"')) {
			this.#classNames = fixedClassNames.split(',');
		}
		console.log(this);
		
		this.#useContainerScale = useContainerScale || false;
	}

	process() {
		this.#activeNodes++;
		for (const className of this.#classNames) {
			this.#processSingle(className);
		}
		this.#activeNodes--;
		this.#checkComplete();
	}

	#processSingle(className) {
		const nodes = this.#brewContainer.getElementsByClassName(className);
		const nodesLen = nodes.length;
		if (nodesLen > 0) {
			this.#activeNodes += nodesLen;
			// Zero padding of at least 3 digits lets the zip file be cbz format compliant
			const padZeros = Math.max(3, Math.ceil(Math.log10(nodesLen + 1)));

			let noIdCount = 0;
			for (const node of nodes) {
				let fileName;
				if (node.id) {
					fileName = `${node.id}.png`;
				} else {
					noIdCount += 1;
					const numString = String(noIdCount).padStart(padZeros, '0');
					fileName = `${className}_${numString}.png`;
				}

				/**
				 * TODO:
				 * - Have a lazy loader for images that turns them into URL encoded sources
				 * - Use --img-<name> on #brewContainer to do the same trick for css backgrounds
				 * - Figure out why Zoom breaks with page sizes
				 */
				const options = {
					fontEmbedCSS: this.#fontEmbedCSS,
					filter: (node) => {
						if (node.nodeName === "IMG") {
							if (!(
								node.src.startsWith('/') ||
								node.src.startsWith('https://proxy') ||
								node.src.startsWith('http://localhost')
							)) {
								node.src = `https://proxy.corsfix.com/?url=${node.src}`;
							}
						}
						return true;
					}
				};
				if (this.#useContainerScale) {
					this.#brewContainer.style.height = `${this.#dpi}px`;
					// this.#brewContainer.style.zoom = `${this.#dpi}%`;
				} else {
					const dpiMultiplier = this.#dpi / DEFAULT_CSS_DPI;
					const {width, height} = this.#getImageSize(node);
					options.canvasWidth = width * dpiMultiplier;
					options.canvasHeight = height * dpiMultiplier;
					// options.scale = dpiMultiplier;
				}

				toPng(node, options).then((dataUrl) => {
					const base64Data = dataUrl.split(',')[1];
					const binaryString = window.atob(base64Data);
					const len = binaryString.length;
					const bytes = new Uint8Array(len);
					for (let i = 0; i < len; ++i) {
						bytes[i] = binaryString.charCodeAt(i);
					}
					this.#zipData[fileName] = bytes;
				})
				.finally(() => {
					this.#activeNodes -= 1;
					this.#checkComplete();
				});
			}
		}
	}

	#checkComplete() {
		if (this.#activeNodes === 0) {
			const zippedData = zipSync(this.#zipData);
			const blob = new Blob([zippedData], { type: "application/zip" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = this.#fileName;
			document.body.appendChild(link);
			link.click();
			
			// Cleanup 
			if (this.#useContainerScale) {
				this.#brewContainer.style.height = '';
			}
			document.body.removeChild(link);
			setTimeout(() => {
				URL.revokeObjectURL(url);
			}, 25000);
		}
	}
	
	#px(node, styleProperty) {
		const win = node.ownerDocument.defaultView || window;
		const val = win.getComputedStyle(node).getPropertyValue(styleProperty);
		return val ? parseFloat(val.replace('px', '')) : 0;
	}

	#getImageSize(node) {
		const leftBorder = this.#px(node, 'border-left-width');
		const rightBorder = this.#px(node, 'border-right-width');
		const width = node.clientWidth + leftBorder + rightBorder;

		const topBorder = this.#px(node, 'border-top-width');
		const bottomBorder = this.#px(node, 'border-bottom-width');
		const height =  node.clientHeight + topBorder + bottomBorder;

		return { width, height };
	}
}

export default function(){
	const [printing, setPrinting] = useState(false);

	// listen for print cycle events to display "loading" message since it can take some time.
	useEffect(()=>{
		document.addEventListener('print:startprep', handlePrintStartPrep);
		document.addEventListener('print:finishedprep', handlePrintPrepFinished);
		return ()=>{
			document.removeEventListener('print:startprep', handlePrintStartPrep);
			document.removeEventListener('print:finishedprep', handlePrintPrepFinished);
		}
	}, []);

	const printPNG = ()=>{
		const brewImageZip = new BrewImageZip(true);
		brewImageZip.process();
	};

	const handlePrintStartPrep = ()=>{ setPrinting(true); };

	const handlePrintPrepFinished = ()=>{ setPrinting(false);	};

	return <Nav.dropdown>
		<Nav.item onClick={printCurrentBrew} id='printtesttarget' color='purple' icon='far fa-file-pdf'>
			{printing ? 'loading' : 'get PDF'}
		</Nav.item>
		<Nav.item onClick={printPNG} color='purple' icon='fas fa-fw fa-file-import'>
			get pngs
		</Nav.item>
	</Nav.dropdown>;
};
