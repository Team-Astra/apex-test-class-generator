/**
 * @file Queries filter
 * @author Nisar Ahmad <nisarahmad.ajmer@gmail.com>
 */

'use strict';

const count = (str) => {
    const re = /select/g;
    return ((str || '').match(re) || []).length;
}

const escapeSpecialCharacters = (data) => {
    return data.replace(/[.;*+?^${}()|[\]\\]/g, '')
}

const findValidGlossary = (lastQuery, sourceCode) => {
    let remainingCode, lastPosition, subQuery, objectAPiName;
    remainingCode = sourceCode.split(lastQuery)[1];
    lastPosition = remainingCode.indexOf("from");
    subQuery = remainingCode.slice(0, lastPosition + 5);
    objectAPiName = remainingCode.split(subQuery)[1].split(' ')[0];
    lastQuery += `${subQuery}${objectAPiName}`;
    return lastQuery;
}

const getAllQueries = (apexSourceCode) => {
    if (!apexSourceCode) return false;
    let sourceCode = apexSourceCode.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s\s+/g, ' ').toLowerCase();
    let arrayOfQueries = new Array();
    for (; sourceCode.includes('select ');) { //Added space after select by soyab
        let completeLevelPosition = sourceCode.indexOf("from");
        let singleQuery = sourceCode.slice(sourceCode.indexOf("select "), completeLevelPosition + 5); //Added space after select by soyab
        let query = `${singleQuery}${sourceCode.split(singleQuery)[1].split(' ')[0]}`;

        // Get first-level subQuery
        if (count(query) > 1) query = findValidGlossary(query, sourceCode);
        // Get second-level subQuery
        if (count(query) > 2) query = findValidGlossary(query, sourceCode);
        // Get third-level subQuery
        if (count(query) > 3) query = findValidGlossary(query, sourceCode);
        // Get fourth-level subQuery
        if (count(query) > 4) query = findValidGlossary(query, sourceCode);
        // Get fifth-level subQuery
        if (count(query) > 5) query = findValidGlossary(query, sourceCode);

        //The code that has been read is being split
        completeLevelPosition = sourceCode.indexOf(query) + query.length;
        sourceCode = sourceCode.slice(completeLevelPosition);
        if (count(query) > 0) {
            query = query.trim();
            let _apiName = escapeSpecialCharacters(query.split(" ").splice(-1)[0]);
            query = query.substring(0, query.lastIndexOf(" "));
            query = `${query} ${_apiName}`;
            arrayOfQueries.push(query);
        }

    }
    return arrayOfQueries;
}

const separateSubQueries = (query) => {
    if (!query) return false;
    let subQuery, afterReplaceBrackets, relationshipName, decodedQuery, lastCharacter;
    let returnObject = {};
    subQuery = query.slice(query.indexOf("("), query.indexOf(")") + 1);
    returnObject.replacementQuery = subQuery;
    afterReplaceBrackets = subQuery.replace("(", "").replace(")", "");
    relationshipName = afterReplaceBrackets.match(new RegExp('from\\s(\\w+)'))[1];
    afterReplaceBrackets = afterReplaceBrackets.split(relationshipName)[0].trim();
    decodedQuery = `${afterReplaceBrackets} ${relationshipName}`;
    lastCharacter = decodedQuery[decodedQuery.length - 1];
    if (lastCharacter == 's') { decodedQuery = decodedQuery.replace(/.$/, ""); }
    else if (lastCharacter == 'r') { decodedQuery = decodedQuery.replace(/.$/, "c") };
    returnObject.responseQuery = decodedQuery;
    return returnObject;
}


const separateSubQuery = (arrayOfQueries) => {
    if (!arrayOfQueries) return false;
    let queryArray = new Array();
    arrayOfQueries.forEach(element => {
        if (count(element) > 1) {
            /* Here a subquery is being extracted from the main query */
            let mainQuery, eclipse;
            eclipse = separateSubQueries(element);
            queryArray.push(eclipse.responseQuery); // single subquery
            mainQuery = element.replace(eclipse.replacementQuery, ""); // Remaining Main Query
            /* Here multiple subquery is being extracted from the remaining main query */
            let stop = count(mainQuery);
            for (let i = 1; i < stop; i++) {
                eclipse = separateSubQueries(mainQuery);
                queryArray.push(eclipse.responseQuery); // single subquery
                mainQuery = mainQuery.replace(eclipse.replacementQuery, ""); //Remaining Main Query
            }
            queryArray.push(mainQuery); // push main Query
        } else {
            queryArray.push(element);
        }
    });
    return queryArray;
}

const fillObjectFieldsMap = (arrayOfQueries) => {
    let returnArray = new Array();
    let sObjectsMap = new Map();
    arrayOfQueries.forEach(query => {
        let objectName = query.split(" ").splice(-1)[0];
        objectName = objectName.replace(/\'/gi, '');
        let afterReplace = query.replace(/select/g, '').replace(/from/g, '').replace(new RegExp("\\b" + objectName + "\\b"), "").replace(/\s\s+/g, ' ').split(",");
        const fieldsData = afterReplace.filter(field => field.length > 1);
        const fieldSet = fieldsData.map(field => field.replace(/\s|\'/g, ""));
        //fill name as Sobejct name and value as a All fields  added by soyab
        if (sObjectsMap.has(objectName)) {
            sObjectsMap.set(objectName, [...sObjectsMap.get(objectName), ...fieldSet])
        } else {
            sObjectsMap.set(objectName, fieldSet);
        }
    });
    sObjectsMap.forEach(function (value, key) {
        //Fill Object
        let fields = new Set(value); // converting fields array to set to remove duplicate values added by soyab
        let info = new Object();
        info.objectName = key;
        info.fields = Array.from(fields);
        returnArray.push(info);

    });
    return returnArray;
}

//Added By soyab for remove comments
const removeComments = (sourceCode) => {
    if (!sourceCode) {
        return false;
    }
    for (; sourceCode.includes('//') || (sourceCode.includes('/*') && sourceCode.includes('*/'));) {
        //remove single line comments
        let firstIdx = sourceCode.indexOf("//");
        let secondIdx = sourceCode.indexOf("\n", firstIdx);
        let commentedStr = sourceCode.slice(firstIdx, secondIdx);
        sourceCode = sourceCode.replace(commentedStr, '');

        //remove multiline comments
        firstIdx = sourceCode.indexOf("/*");
        secondIdx = sourceCode.indexOf("*/", firstIdx);
        commentedStr = sourceCode.slice(firstIdx, secondIdx + 2);
        sourceCode = sourceCode.replace(commentedStr, '');
    }
    return sourceCode;
}

const truncateApexSourceCode = (apexSourceCode) => {
    apexSourceCode = removeComments(apexSourceCode);
    let allQueriesWitSubQuery = getAllQueries(apexSourceCode);
    //console.log('allQueriesWitSubQuery', allQueriesWitSubQuery);
    let allQueries = separateSubQuery(allQueriesWitSubQuery);
    //console.log('allQueries', allQueries);
    let mainData = fillObjectFieldsMap(allQueries);
    //console.log('mainData', mainData);
    return mainData;
}

const sObjectInformationFiltration = (sObjectInformation) => {
    if (!sObjectInformation) return false;
    let requiredFields = [];
    let nonRequiredFields = [];
    sObjectInformation.forEach(function (element) {
        let field = { label: element.label, apiName: element.name, type: element.type, picklistValues: element.picklistValues };
        if (!element.nillable && !element.defaultedOnCreate && element.updateable && element.createable) {
            requiredFields.push(field);
        } else if (element.updateable && element.name !== "OwnerId") { // OwnerId Added By Soyab
            nonRequiredFields.push(field);
        }
    });
    let fieldDescriptionObj = {
        required: requiredFields,
        nonRequired: nonRequiredFields,
    };
    return fieldDescriptionObj;
};

/************************************************ - X - ********************************************************** */
/**
 * @description : generate test data
 * @author : Soyab Hussain <soyab@ibirdsservices.com>
 */

const getTestDataForSobjectField = (fieldDefination) => {
    if (!fieldDefination) {
        return false;
    }
    let fieldVal = '';

    if (fieldDefination.type === 'date') {
        fieldVal = `${fieldDefination.apiName} = Date.today(), `;
    } else if (fieldDefination.type === 'datetime') {
        fieldVal = fieldDefination.apiName + ' =' + ' System.now(), ';
    } else if (fieldDefination.type === 'email') {
        fieldVal = `${fieldDefination.apiName} = 'testEmail@gmail.com', `;
    } else if (fieldDefination.type === 'picklist') {
        fieldVal = fieldDefination.apiName + ' =';
        if (fieldDefination && fieldDefination.picklistValues) {
            fieldVal += `'${fieldDefination.picklistValues[0].value}', `;
        } else {
            fieldVal += `'Here picklist value', `;
        }
    } else if (fieldDefination.type === 'time') {
        fieldVal = `${fieldDefination.apiName} = Time.newInstance(1, 2, 3, 4), `;
    } else if (fieldDefination.type === 'string') {
        fieldVal = `${fieldDefination.apiName} = 'test value', `;
    } else if (fieldDefination.type === 'currency') {
        fieldVal = `${fieldDefination.apiName} = 1.1, `;
    } else if (fieldDefination.type === 'double') {
        fieldVal = `${fieldDefination.apiName} = 1.1, `;
    } else if (fieldDefination.type === 'phone') {
        fieldVal = `${fieldDefination.apiName} = '1234567890', `;
    } else if (fieldDefination.type === 'url') {
        fieldVal = `${fieldDefination.apiName} = 'www.google.com', `;
    } else if (fieldDefination.type === 'textarea') {
        fieldVal = `${fieldDefination.apiName} = 'Test Value', `;
    } else if (fieldDefination.type === 'boolean') {
        fieldVal = `${fieldDefination.apiName} = TRUE, `;
    } else if (fieldDefination.type === 'reference') {
        fieldVal = `${fieldDefination.apiName} = 'Here is reference id', `;
    } else if (fieldDefination.type === 'address') {
        fieldVal = `${fieldDefination.apiName} = 'test address', `;
    } else if (fieldDefination.type === 'int') {
        fieldVal = `${fieldDefination.apiName} = 12,`;
    } else if (fieldDefination.type === 'combobox' || fieldDefination.type === 'multipicklist') {
        if (fieldDefination.picklistValues) {
            fieldVal = `${fieldDefination.apiName} = '${fieldDefination.picklistValues[0].value}',`;
        }
    }
    return fieldVal;

}

const getSapretlySobjectData = (describedSobject, selectedFieldWithSobj) => {
    if (!describedSobject || !selectedFieldWithSobj) {
        return false;
    }
    let nonRequiredFields = describedSobject.nonRequired;
    let requiredFields = describedSobject.required;
    let fieldsInQuery = selectedFieldWithSobj.fields;
    nonRequiredFields.map(element => element.required = false);
    requiredFields.map(element => element.required = true);
    let allSobjectFields = [...nonRequiredFields, ...requiredFields];
    let sObjectTestData = '';
    let sObjName = selectedFieldWithSobj.objectName;
    let objectName = sObjName.replace(/_/g, " ").replace(/\s/g, '') + 'Obj';
	//console.log('objectName', objectName);
    sObjectTestData += sObjName.charAt(0).toUpperCase() + sObjName.slice(1) + ' ' + objectName + ' = new ' + 
	//console.log('sObjectTestData111', sObjectTestData);
	sObjName.charAt(0).toUpperCase() + sObjName.slice(1) + ' (';
    let isSOjbectFieldData = false; // Added by Soyab
    allSobjectFields.forEach(function (element) {
        let fieldVal = '';
        if ((element && element.required) || (element && fieldsInQuery.includes(element.apiName.toLowerCase()))) {
            fieldVal = `\n\t\t\t${getTestDataForSobjectField(element)}`;
            isSOjbectFieldData = true; // Added by Soyab
        }
        if (fieldVal && fieldVal != '') sObjectTestData += fieldVal;
    });
    if (!isSOjbectFieldData) {
        sObjectTestData = getAtleastOneFieldForTestData(sObjectTestData, allSobjectFields);
		//console.log('sObjectTestData222', sObjectTestData);
    }
    // Added by Soyab
	if(sObjectTestData) {// version-8
		let lastIndexComma = sObjectTestData.lastIndexOf(',');
		sObjectTestData = sObjectTestData.slice(0, lastIndexComma) + sObjectTestData.slice(lastIndexComma).replace(',', '\n\t\t);\n\t\tinsert ' + objectName + ';\n\t\t');
		return sObjectTestData;
	}
    return '';// version-8

}

//Added By Soyab
const getAtleastOneFieldForTestData = (sObjectTestData, allSobjectFields) => {
    if (!sObjectTestData || !allSobjectFields) {
        return '';
    }
    if (allSobjectFields.length) {
        sObjectTestData += `\n\t\t\t${getTestDataForSobjectField(allSobjectFields[0])}`;
        return sObjectTestData;
    }
}

const getAttachmentTestData = () => { 
    return `Attachment attachObj = new Attachment(Name = 'Unit Test Attachment', bodyBlob = Blob.valueOf('test body'), parentId = 'parentId');\n\t\tinsert attachObj;\n\t\t`;
}

const getTestClassContent = (mainData, sObjectDataFromServer) => {
    if (!mainData || !sObjectDataFromServer) {
        return false;
    }
    let testClassContent = '';
    let sObjectMap = new Map();
    sObjectDataFromServer.forEach(function (value, key) {
        sObjectMap.set(key.toLowerCase(), value)
    });
    mainData.forEach(function (element) {
        if (element.objectName.includes('attachment') || element.objectName.includes('attachments')) { 
            //testClassContent += getAttachmentTestData();
        } else if (sObjectMap.has(element.objectName)) {
            testClassContent += getSapretlySobjectData(sObjectMap.get(element.objectName), element);
        }
    });
    return testClassContent;
}
/************************************************   x   ********************************************************** */
module.exports = {
    truncateApexSourceCode,
    sObjectInformationFiltration,
    getTestClassContent
};