// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
'use strict';
const vscode = require('vscode');
const path = require("path");
const fs = require("fs");
const exec = require('child_process').exec;
const filterizr = require('./src/filterizr');
/* Shortened */
const _TextDocument = vscode.workspace.openTextDocument;
const window = vscode.window;

// const util = require('util');
// const exec = util.promisify(require('child_process').exec);

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

const errorMessage = {
	unauthorized: 'Please login first and set default org to continue',
	forbidden: 'The server connection did not work correctly.',
	internalServerError: 'Service Unavailable - Server data not found...',
	emptyApex: 'No appropriate readable data found in this class',
	notExist: 'The requested resource does not exist',
	badGateway: 'Uncaught Exception!',
	unsupported: 'Failed to read queries properly',
	unknown: 'Something went wrong..!',
	cancel: 'User has canceled the operation',
}
const progressBarMessage = {
	processingStart: 'Processing to generate test data...',
	readApex: 'The class code is on processing to filter',
	serverResponse: 'Server data received! - still going...',
	finalStage: 'Test data ready to be converted to class! - almost there...',
	success:'Successfully created apex test class...'
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	let disposable = vscode.commands.registerCommand('extension.createTestClass', function () {
		/* Validation : Check the correct file otherwise show error */
		let languageName = vscode.window.activeTextEditor.document.languageId;
		if (languageName != 'apex') {
			return vscode.window.showErrorMessage('Error: This file is not apex class, please select the correct file'); 
		}
		/************************************************************************************************
		 * login popup 
		 */
		function loginToOrg() {
			window.showWarningMessage(errorMessage.unauthorized, 'Production', 'Sandbox')
				.then((org) => {
					let oAuthCommand = 'sfdx force:auth:web:login';
					if (org == 'Sandbox') oAuthCommand += ' -r https://test.salesforce.com';
					exec(oAuthCommand, (error, stdout) => {
						if (error) window.showErrorMessage(`${error}`);
						if (stdout) window.showInformationMessage('Successfully logged in');
					});
			});
		}
		/************************************************************************************************
		 * Get SFDX Config File to default Org USER name
		 */
		function getSFDXConfigUser (){
			return new Promise((resolve, reject) => {
				let currentFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
				let sfdxConfigFile = `${currentFolder}\\.sfdx\\sfdx-config.json`;
				_TextDocument(sfdxConfigFile).then((sfdxDocument) => {
					if (!sfdxDocument) throw Error;
					let defaultOrgSet = JSON.parse(sfdxDocument.getText());
					resolve(defaultOrgSet.defaultusername);
				}).then(undefined, err => {
					console.error(err);
					loginToOrg(); // Login First
					reject(new Error(errorMessage.unauthorized));
				});
			});
		}
		/************************************************************************************************
		 *  Get Authentication Detail File Path
		 */
		function getAuthenticationDetailFilePath(selectedOrgUserName) {
			return new Promise((resolve, reject) => {
				let aliasFile = `${process.env['USERPROFILE']}\\.sfdx\\alias.json`;
				_TextDocument(aliasFile).then((aliasDocument) => {
					if (!aliasDocument) throw Error;
					let allOrgData = JSON.parse(aliasDocument.getText());
					let orgEmailAddress = allOrgData.orgs[selectedOrgUserName];
					let authenticationDetailFile = `${process.env['USERPROFILE']}\\.sfdx\\${orgEmailAddress}.json`;
					resolve(authenticationDetailFile);
				}).then(undefined, err => {
					console.error(err);
					reject(new Error(errorMessage.missingDefaultOrg));
				});
			});
		}
		/************************************************************************************************
		 *  Get Authentication Detail Document
		 */
		function getOAuthDocument(authenticationDetailFile) {
			return new Promise((resolve, reject) => {
				_TextDocument(authenticationDetailFile).then((oAuthDocument) => {
					if (!oAuthDocument) throw Error;
					resolve(JSON.parse(oAuthDocument.getText()));
				}).then(undefined, err => {
					console.error(err);
					reject(new Error(errorMessage.missingDefaultOrg));
				});
			});
		}
		/************************************************************************************************
		 *   Sorting queries from source code : Filter Apex Code
		 */
		function sortingQueriesFromCode(username) {
			return new Promise((resolve, reject) => {
				let currentlyOpenApexClassfile = vscode.window.activeTextEditor.document.fileName;
				_TextDocument(currentlyOpenApexClassfile).then((document) => {
					//do to async
					let queries_details = filterizr.truncateApexSourceCode(document.getText());
					setTimeout(() => {
						if (queries_details && queries_details.length){
							let details = {
								user: username,
								queries: queries_details,
							}
							resolve(details);
						}else{
							reject('NoQueryFound');
						}
					}, 5000);
				}).then(undefined, err => {
					console.error(err);
					reject(new Error(errorMessage.unsupported));
				});
			});
		}
		/************************************************************************************************
		 *   fetch sObject Info From Server
		 */
		const fetchObjectInfoFromServer = (userDetails, arrayOfQueries) => {
			if (!userDetails && !arrayOfQueries) return false;
			return new Promise((resolve, reject) => {
				let sObjectApiName = [...new Set(arrayOfQueries.map(item => item.objectName))];
				// get sObject Info form server and fill map
				let fieldDescriptionMap = new Map();
				sObjectApiName.forEach(objectName => {
					if (objectName != 'attachment' && objectName != 'attachments') {
						let oAuthCommand = `sfdx force:schema:sobject:describe -s ${objectName} --json -u ${userDetails.username}`;
						exec(oAuthCommand, (error, stdout, stderr) => {
							if (error) {
								console.error(error);
								//return reject(new Error(`${error}`));
							}
							if (stdout){
								let meta = JSON.parse(stdout);
								let fieldDescriptionObj = filterizr.sObjectInformationFiltration(meta.result.fields);
								fieldDescriptionMap.set(meta.result.name, fieldDescriptionObj);
							}
							if (stderr) console.warn(stderr);
						});
					}
				});
				setTimeout(() => {
					if (fieldDescriptionMap && fieldDescriptionMap.size) {
						let details = {
							classQueries: arrayOfQueries,
							sObjectfieldsMap: fieldDescriptionMap,
						}
						resolve(details);
					} else {
						let attachment = sObjectApiName.includes("attachment") || sObjectApiName.includes("attachments");
						if (attachment){
							reject(`OnlyAttachment`);
						}else{
							reject(`NoServerDataFound`);
						}
					}
				}, 15000);
			});
		}
		/************************************************************************************************
		*   Generate Test Source Data - with combined server data
		*/
		const generateTestSourceData = (listOfQueries, fieldsInfoMap) => {
			//createApexAndXMLFile(mainContents);
			return new Promise((resolve, reject) => {
				if (!listOfQueries && !fieldsInfoMap) return reject(new Error(errorMessage.badGateway));;
				let mainContents = filterizr.getTestClassContent(listOfQueries, fieldsInfoMap);
				//if (mainContents){// version-8
					setTimeout(() => {
						resolve(mainContents);
					}, 3000);
				//}else{// version-8
					//reject(new Error(errorMessage.badGateway));// version-8
				//} // version-8
			});
		}
		/************************************************************************************************
		*   Creating Documents files
		*/
		const createApexAndXMLFile = (classTestContents) => {
			return new Promise((resolve, reject) => {
				//if (!classTestContents) return reject(new Error(errorMessage.badGateway)); // version-8
				let currentlyOpenTabfilePath = vscode.window.activeTextEditor.document.fileName;
				let currentlyOpenTabfileName = path.basename(currentlyOpenTabfilePath);
				let classDetails = currentlyOpenTabfileName.split('.');
				let location = currentlyOpenTabfilePath.replace(currentlyOpenTabfileName, '');
				let testClassContent = `@isTest\nprivate class Test${classDetails[0]}{\n\n\t@testSetup static void setup(){\n\n\t\t${classTestContents}\n\t}\n\n\t@isTest static void testMethod1() {\n\t\t// code_block\t\n\t}\n\n\t@isTest static void testMethod2() {\n\t\t// code_block\t\n\t}\n}`;
				//Create Main Test Class
				fs.writeFile(path.join(location, `Test${classDetails[0]}.cls`), testClassContent, err => {
					if (err) return reject(new Error("Failed to create Test Class file!"));

					//Create XML File-----------------------------
					let currentlyOpenApexXMLfile = vscode.window.activeTextEditor.document.fileName + '-meta.xml';
					_TextDocument(currentlyOpenApexXMLfile).then((document) => {
						let xml = document.getText();
						let apiVersion = xml.slice(xml.indexOf("<apiVersion>"), xml.indexOf("</apiVersion>")).replace("<apiVersion>", "");
						let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<ApexClass xmlns="urn:metadata.tooling.soap.sforce.com" fqn="Test${classDetails[0]}">\n\t<apiVersion>${apiVersion}</apiVersion>\n\t<status>Active</status>\n</ApexClass>`;
						fs.writeFile(path.join(location, `Test${classDetails[0]}.cls-meta.xml`), xmlContent, err => {
							if (err) return reject(new Error("Failed to create Test Class metadata file!"));
						});
					}).then(undefined, err => {
						let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<ApexClass xmlns="urn:metadata.tooling.soap.sforce.com" fqn="Test${classDetails[0]}">\n\t<apiVersion>47.0</apiVersion>\n\t<status>Active</status>\n</ApexClass>`;
						fs.writeFile(path.join(location, `Test${classDetails[0]}.cls-meta.xml`), xmlContent, err => {
							if (err) return reject(new Error("Failed to create Test Class metadata file!"));
						});
					});
					//--------------x-------------x-------------x-
					//Opne File on Tab
					let filePath = path.join(location, `Test${classDetails[0]}.cls`);
					let openPath = vscode.Uri.file(filePath);
					_TextDocument(openPath).then(doc => {
						vscode.window.showTextDocument(doc);
						setTimeout(() => {
							resolve('Successful');
						}, 500);
					});
				});
			});
		}
		/************************************************************************************************
		*   Creating Empty Documents files
		*/
		const createEmptyApex = (isData) => {
			let Attachment = '';
			if (isData) Attachment = `Attachment attachObj = new Attachment(Name = 'Unit Test Attachment', bodyBlob = Blob.valueOf('test body'), parentId = 'parentId');\n\t\tinsert attachObj;\n\t\t`;
			let currentlyOpenTabfilePath = vscode.window.activeTextEditor.document.fileName;
			let currentlyOpenTabfileName = path.basename(currentlyOpenTabfilePath);
			let classDetails = currentlyOpenTabfileName.split('.');
			let location = currentlyOpenTabfilePath.replace(currentlyOpenTabfileName, '');
			let testClassContent = `@isTest\nprivate class Test${classDetails[0]}{\n\n\t@testSetup static void setup(){\n\n\t\t${Attachment}\n\t}\n\n\t@isTest static void testMethod1() {\n\t\t// code_block\t\n\t}\n\n\t@isTest static void testMethod2() {\n\t\t// code_block\t\n\t}\n}`;
			let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<ApexClass xmlns="urn:metadata.tooling.soap.sforce.com" fqn="${classDetails[0]}">\n\t<apiVersion>47.0</apiVersion>\n\t<status>Active</status>\n</ApexClass>`;
			//Create Main Test Class
			fs.writeFile(path.join(location, `Test${classDetails[0]}.cls`), testClassContent, err => {
				if (err) return false;
				fs.writeFile(path.join(location, `Test${classDetails[0]}.cls-meta.xml`), xmlContent, err => {});
				//Opne File on Tab
				let filePath = path.join(location, `Test${classDetails[0]}.cls`);
				let openPath = vscode.Uri.file(filePath);
				_TextDocument(openPath).then(doc => {
					vscode.window.showTextDocument(doc);
				});
			});
			window.showInformationMessage(progressBarMessage.success, 'Close');
		}

		/*+++++++++++++++++++++++++++++++++++++++ :  Main Function : +++++++++++++++++++++++++++++++++++++++*/
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			cancellable: true
		}, (progress, token) => {
				token.onCancellationRequested(() => {
					window.showWarningMessage(errorMessage.cancel, 'Close');
				});
				progress.report({ message: progressBarMessage.processingStart }); // Display a Progress bar to the user
				/********/
				return new Promise((resolve) => {
						resolve(getSFDXConfigUser());
					}).then(function (result) {
						if (token.isCancellationRequested) throw new Error(errorMessage.cancel);
						return getAuthenticationDetailFilePath(result);
					}).then(function (result) {
						if (token.isCancellationRequested) throw new Error(errorMessage.cancel);
						return getOAuthDocument(result);
					}).then(function (result) {
						if (token.isCancellationRequested) throw new Error(errorMessage.cancel);
						return sortingQueriesFromCode(result);
					}).then(function (result) {
						if (token.isCancellationRequested) throw new Error(errorMessage.cancel);
						if (!result) throw new Error(errorMessage.unsupported);
						return fetchObjectInfoFromServer(result.user, result.queries);
					}).then(function (result) {
						if (token.isCancellationRequested) throw new Error(errorMessage.cancel);
						return generateTestSourceData(result.classQueries,result.sObjectfieldsMap);
					}).then(function (result) {
						if (token.isCancellationRequested) throw new Error(errorMessage.cancel);
						if (!result) throw new Error(errorMessage.badGateway); // version-8
						return createApexAndXMLFile(result);
					}).then(function (result) {
						if (result == 'Successful') window.showInformationMessage(progressBarMessage.success,'Close');
					}).catch(function (e) {
						console.error('catch :', e); 
						if (e === 'NoQueryFound'){
							createEmptyApex(false);
						} else if (e === 'OnlyAttachment') {
							createEmptyApex(true);
						} else if (e === 'NoServerDataFound') {
							createEmptyApex(false);
							window.showWarningMessage(errorMessage.notExist);
						}else{
							window.showErrorMessage(`${e}`);	
						}
					});
		});
		/*+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++*/
	/***********************************:   END    :*******************************/
	});
	context.subscriptions.push(disposable);
}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() { }

module.exports = {
	activate,
	deactivate
}
