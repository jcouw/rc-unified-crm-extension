/* eslint-disable no-param-reassign */
const axios = require('axios');
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');
const { secondsToHoursMinutesSeconds } = require('../../lib/util');

function getAuthType() {
    return 'apiKey';
}

function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}`).toString('base64');
}

function getAuthHeader({ userKey }) {
    return Buffer.from(`${process.env.REDTAIL_API_KEY}:${userKey}`).toString('base64');
}

async function getUserInfo({ authHeader, additionalInfo }) {
    try {
        const overrideAPIKey = `${process.env.REDTAIL_API_KEY}:${additionalInfo.username}:${additionalInfo.password}`;
        const overrideAuthHeader = `Basic ${getBasicAuth({ apiKey: overrideAPIKey })}`;
        const authResponse = await axios.get(`${process.env.REDTAIL_API_SERVER}/authentication`, {
            headers: {
                'Authorization': overrideAuthHeader
            }
        });
        additionalInfo['userResponse'] = authResponse.data.authenticated_user;
        delete additionalInfo.password;
        const id = additionalInfo.username;
        const name = additionalInfo.username;
        const timezoneName = '';
        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                timezoneName,
                overridingApiKey: additionalInfo.userResponse.user_key,
                platformAdditionalInfo: additionalInfo
            },
            returnMessage: {
                messageType: 'success',
                message: 'Connected to Redtail.',
                ttl: 1000
            }
        }
    }
    catch (e) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Could not load user information Please check your credentials.',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Redtail was unable to fetch information for the currently logged in user. Please check your permissions in Redtail and make sure you have permission to access and read user information.`
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        }
    }
}

async function unAuthorize({ user }) {
    // remove user credentials
    user.accessToken = '';
    user.refreshToken = '';
    await user.save();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of Redtail',
            ttl: 1000
        }
    }
}

async function findContact({ user, phoneNumber }) {
    const matchedContactInfo = [];
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    phoneNumber = phoneNumber.replace(' ', '+')
    const phoneNumberObj = parsePhoneNumber(phoneNumber);
    let phoneNumberWithoutCountryCode = phoneNumber;
    if (phoneNumberObj.valid) {
        phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    }
    const personInfo = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/contacts/search_basic?phone_number=${phoneNumberWithoutCountryCode}`,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    const categoriesResp = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/lists/categories`,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    const activeCategories = categoriesResp.data.categories.filter(c => !c.deleted);
    for (let rawPersonInfo of personInfo.data.contacts) {
        rawPersonInfo['phoneNumber'] = phoneNumber;
        matchedContactInfo.push(formatContact(rawPersonInfo, activeCategories));
    }
    matchedContactInfo.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        isNewContact: true,
        additionalInfo: {
            category: activeCategories.map(c => {
                return {
                    const: c.id,
                    title: c.name
                }
            })
        }
    });
    return {
        successful: true,
        matchedContactInfo
    };
}

async function findContactWithName({ user, name }) {
    const matchedContactInfo = [];
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    /*
    Redtail contact search functionality works correctly with name-based queries, including first name, last name, and full name.
     It handles all variations without requiring the query to be split
    */
    const personInfo = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/contacts/search_basic?name=${name}`,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });

    console.log({ COntacts: personInfo.data.contacts, Data: personInfo.data });
    const categoriesResp = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/lists/categories`,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    const activeCategories = categoriesResp.data.categories.filter(c => !c.deleted);
    for (let rawPersonInfo of personInfo.data.contacts) {
        matchedContactInfo.push(formatContact(rawPersonInfo, activeCategories));
    }
    return {
        successful: true,
        matchedContactInfo
    };
}

async function createContact({ user, phoneNumber, newContactName }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
    const personInfo = await axios.post(
        `${process.env.REDTAIL_API_SERVER}/contacts`,
        {
            type: 'Crm::Contact::Individual',
            first_name: newContactName.split(' ').length > 1 ? newContactName.split(' ')[0] : '',
            last_name: newContactName.split(' ').length > 1 ? newContactName.split(' ')[1] : newContactName.split(' ')[0],
            phones: [
                {
                    phone_type: 6,
                    number: phoneNumberObj.number.significant,
                    country_code: phoneNumberObj.countryCode
                }
            ]
        },
        {
            headers: { 'Authorization': overrideAuthHeader }
        }
    );
    return {
        contactInfo: {
            id: personInfo.data.contact.id,
            name: `${personInfo.data.contact.first_name} ${personInfo.data.contact.last_name}`
        },
        returnMessage: {
            message: `Contact created.`,
            messageType: 'success',
            ttl: 2000
        }
    }
}

async function createCallLog({ user, contactInfo, callLog, note, additionalSubmission, aiNote, transcript }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });

    let description = '';
    if (user.userSettings?.addCallLogNote?.value ?? true) { description = upsertCallAgentNote({ body: description, note }); }
    description += '<b>Call details</b><ul>';
    const subject = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`;
    if (user.userSettings?.addCallSessionId?.value ?? false) { description = upsertCallSessionId({ body: description, id: callLog.sessionId }); }
    if (user.userSettings?.addCallLogSubject?.value ?? true) { description = upsertCallSubject({ body: description, subject }); }
    if (user.userSettings?.addCallLogContactNumber?.value ?? true) { description = upsertContactPhoneNumber({ body: description, phoneNumber: contactInfo.phoneNumber, direction: callLog.direction }); }
    if (user.userSettings?.addCallLogDateTime?.value ?? true) { description = upsertCallDateTime({ body: description, startTime: callLog.startTime, timezoneOffset: user.userSettings?.redtailCustomTimezone?.value ?? 0 }); }
    if (user.userSettings?.addCallLogDuration?.value ?? true) { description = upsertCallDuration({ body: description, duration: callLog.duration }); }
    if (user.userSettings?.addCallLogResult?.value ?? true) { description = upsertCallResult({ body: description, result: callLog.result }); }
    if (!!callLog.recording?.link && (user.userSettings?.addCallLogRecording?.value ?? true)) { description = upsertCallRecording({ body: description, recordingLink: callLog.recording.link }); }
    description += '</ul>';
    if (!!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true)) { description = upsertAiNote({ body: description, aiNote }); }
    if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { description = upsertTranscript({ body: description, transcript }); }

    let extraDataTracking = {
        withSmartNoteLog: !!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true),
        withTranscript: !!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)
    };
    const postBody = {
        subject,
        description,
        start_date: moment(callLog.startTime).utc().toISOString(),
        end_date: moment(callLog.startTime).utc().add(callLog.duration, 'seconds').toISOString(),
        activity_code_id: 3,
        category_id: additionalSubmission?.category ?? 2,
        repeats: 'never',
        linked_contacts: [
            {
                contact_id: contactInfo.id
            }
        ]
    }
    const addLogRes = await axios.post(
        `${process.env.REDTAIL_API_SERVER}/activities`,
        postBody,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    if (note) {
        const addNoteRes = await axios.post(
            `${process.env.REDTAIL_API_SERVER}/activities/${addLogRes.data.activity.id}/notes`,
            {
                category_id: additionalSubmission?.category ?? 2,
                note_type: 1,
                body: note
            },
            {
                headers: { 'Authorization': overrideAuthHeader }
            });
    }
    const completeLogRes = await axios.put(
        `${process.env.REDTAIL_API_SERVER}/activities/${addLogRes.data.activity.id}`,
        {
            'completed': true
        },
        {
            headers: { 'Authorization': overrideAuthHeader }
        });

    await updateCategoryToUserSetting({ user, authHeader: overrideAuthHeader });

    return {
        logId: completeLogRes.data.activity.id,
        returnMessage: {
            message: 'Call logged',
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    };
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const existingRedtailLogId = existingCallLog.thirdPartyLogId;
    const getLogRes = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingRedtailLogId}`,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    let logBody = getLogRes.data.activity.description;
    if (!!note && (user.userSettings?.addCallLogNote?.value ?? true)) { logBody = upsertCallAgentNote({ body: logBody, note }); }
    if (!!existingCallLog.sessionId && (user.userSettings?.addCallSessionId?.value ?? false)) { logBody = upsertCallSessionId({ body: logBody, id: existingCallLog.sessionId }); }
    if (!!subject && (user.userSettings?.addCallLogSubject?.value ?? true)) { logBody = upsertCallSubject({ body: logBody, subject }); }
    if (!!startTime && (user.userSettings?.addCallLogDateTime?.value ?? true)) { logBody = upsertCallDateTime({ body: logBody, startTime, timezoneOffset: user.userSettings?.redtailCustomTimezone?.value ?? 0 }); }
    if (!!duration && (user.userSettings?.addCallLogDuration?.value ?? true)) { logBody = upsertCallDuration({ body: logBody, duration }); }
    if (!!result && (user.userSettings?.addCallLogResult?.value ?? true)) { logBody = upsertCallResult({ body: logBody, result }); }
    if (!!recordingLink && (user.userSettings?.addCallLogRecording?.value ?? true)) { logBody = upsertCallRecording({ body: logBody, recordingLink }); }
    if (!!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true)) { logBody = upsertAiNote({ body: logBody, aiNote }); }
    if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { logBody = upsertTranscript({ body: logBody, transcript }); }
    let putBody = {};

    if (subject) {
        putBody.subject = subject;
    }
    putBody.description = logBody;
    putBody.start_date = moment(startTime).utc().toISOString();
    putBody.end_date = moment(startTime).utc().add(duration, 'seconds').toISOString();

    const putLogRes = await axios.put(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingRedtailLogId}`,
        putBody,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    return {
        updatedNote: putBody.description,
        returnMessage: {
            message: 'Call log updated.',
            messageType: 'success',
            ttl: 2000
        }
    };
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const userName = user.id;
    const messageType = recordingLink ? 'Voicemail' : (faxDocLink ? 'Fax' : 'SMS');
    let subject = '';
    let description = '';
    switch (messageType) {
        case 'SMS':
            subject = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.userSettings?.redtailCustomTimezone?.value ?? 0)).format('YY/MM/DD')}`;
            description =
                `<br><b>${subject}</b><br>` +
                '<b>Conversation summary</b><br>' +
                `${moment(message.creationTime).utcOffset(Number(user.userSettings?.redtailCustomTimezone?.value ?? 0)).format('dddd, MMMM DD, YYYY')}<br>` +
                'Participants<br>' +
                `<ul><li><b>${userName}</b><br></li>` +
                `<li><b>${contactInfo.name}</b></li></ul><br>` +
                'Conversation(1 messages)<br>' +
                'BEGIN<br>' +
                '------------<br>' +
                '<ul>' +
                `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(Number(user.userSettings?.redtailCustomTimezone?.value ?? 0)).format('hh:mm A')}<br>` +
                `<b>${message.subject}</b></li>` +
                '</ul>' +
                '------------<br>' +
                'END<br><br>' +
                '--- Created via RingCentral App Connect';
            break;
        case 'Voicemail':
            subject = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.userSettings?.redtailCustomTimezone?.value ?? 0)).format('YY/MM/DD')}`;
            description = `<br><b>${subject}</b><br>Voicemail recording link: ${recordingLink} <br><br>--- Created via RingCentral App Connect`;
            break;
        case 'Fax':
            subject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.userSettings?.redtailCustomTimezone?.value ?? 0)).format('YY/MM/DD')}`;
            description = `<br><b>${subject}</b><br>Fax document link: ${faxDocLink} <br><br>--- Created via RingCentral App Connect`;
            break;
    }

    const postBody = {
        subject,
        description,
        start_date: moment(message.creationTime).utc().toISOString(),
        end_date: moment(message.creationTime).utc().toISOString(),
        activity_code_id: 3,
        repeats: 'never',
        linked_contacts: [
            {
                contact_id: contactInfo.id
            }
        ]
    }
    const addLogRes = await axios.post(
        `${process.env.REDTAIL_API_SERVER}/activities`,
        postBody,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    const completeLogRes = await axios.put(
        `${process.env.REDTAIL_API_SERVER}/activities/${addLogRes.data.activity.id}`,
        {
            'completed': true
        },
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    return {
        logId: completeLogRes.data.activity.id,
        returnMessage: {
            message: 'Message logged',
            messageType: 'success',
            ttl: 1000
        }
    };
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const existingLogId = existingMessageLog.thirdPartyLogId;
    const userName = user.id;
    const getLogRes = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingLogId}`,
        {
            headers: { 'Authorization': overrideAuthHeader, 'include': 'linked_contacts' }
        });
    let logBody = getLogRes.data.activity.description;
    let putBody = {};
    const newMessageLog =
        `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}<br>` +
        `<b>${message.subject}</b></li>`;
    logBody = logBody.replace('------------<br><ul>', `------------<br><ul>${newMessageLog}`);

    const regex = RegExp('<br>Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `<br>Conversation(${parseInt(matchResult[1]) + 1} messages)`);

    putBody = {
        description: logBody,
        end_date: moment(message.creationTime).utc().toISOString()
    }
    const putLogRes = await axios.patch(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingLogId}`,
        putBody,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
}

async function getCallLog({ user, callLogId, authHeader }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const getLogRes = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/activities/${callLogId}`,
        {
            headers: { 'Authorization': overrideAuthHeader, 'include': 'linked_contacts' }
        });
    const logBody = getLogRes.data.activity.description;
    const note = logBody.match(/<br>(.+?)<br><br>/)?.length > 1 ? logBody.match(/<br>(.+?)<br><br>/)[1] : '';
    return {
        callLogInfo: {
            subject: getLogRes.data.activity.subject,
            note,
            contactName: `${getLogRes.data.activity.linked_contacts[0].first_name} ${getLogRes.data.activity.linked_contacts[0].last_name}`,
        }
    }
}

function formatContact(rawContactInfo, categories) {
    return {
        id: rawContactInfo.id,
        name: `${rawContactInfo.full_name}`,
        phone: rawContactInfo.phoneNumber,
        title: rawContactInfo.job_title ?? "",
        type: 'contact',
        additionalInfo: {
            category: categories.map(c => {
                return {
                    const: c.id,
                    title: c.name
                }
            })
        }
    }
}

function upsertCallAgentNote({ body, note }) {
    if (!note) {
        return body;
    }
    const noteRegex = RegExp('<b>Agent notes</b><br>([\\s\\S]+?)<br><br>');
    if (noteRegex.test(body)) {
        body = body.replace(noteRegex, `<b>Agent notes</b><br>${note}<br><br>`);
    }
    else {
        body += `<b>Agent notes</b><br>${note}<br><br>`;
    }
    return body;
}
function upsertCallSubject({ body, subject }) {
    const subjectRegex = RegExp('<li><b>Summary</b>: (.+?)(?:</li>|</ul>)');
    if (subjectRegex.test(body)) {
        body = body.replace(subjectRegex, (match, p1) => `<li><b>Summary</b>: ${subject}${p1.endsWith('</ul>') ? '</ul>' : '</li>'}`);
    } else {
        body += `<li><b>Summary</b>: ${subject}</li>`;
    }
    return body;
}

function upsertCallSessionId({ body, id }) {
    const idRegex = RegExp('<li><b>Session Id</b>: (.+?)(?:<li>|</ul>)');
    if (idRegex.test(body)) {
        body = body.replace(idRegex, (match, p1) => `<li><b>Session Id</b>: ${id}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`);
    } else {
        body += `<li><b>Session Id</b>: ${id}<li>`;
    }
    return body;
}

function upsertContactPhoneNumber({ body, phoneNumber, direction }) {
    const phoneNumberRegex = RegExp(`<li><b>${direction === 'Outbound' ? 'Recipient' : 'Caller'} phone number</b>: (.+?)(?:</li>|</ul>)`);
    if (phoneNumberRegex.test(body)) {
        body = body.replace(phoneNumberRegex, (match, p1) => `<li><b>${direction === 'Outbound' ? 'Recipient' : 'Caller'} phone number</b>: ${phoneNumber}${p1.endsWith('</ul>') ? '</ul>' : '</li>'}`);
    } else {
        body += `<li><b>${direction === 'Outbound' ? 'Recipient' : 'Caller'} phone number</b>: ${phoneNumber}</li>`;
    }
    return body;
}

function upsertCallDateTime({ body, startTime, timezoneOffset }) {
    const dateTimeRegex = RegExp('<li><b>Date/time</b>: (.+?)(?:</li>|</ul>)');
    if (dateTimeRegex.test(body)) {
        const updatedDateTime = moment(startTime).utcOffset(Number(timezoneOffset)).format('YYYY-MM-DD hh:mm:ss A');
        body = body.replace(dateTimeRegex, (match, p1) => `<li><b>Date/time</b>: ${updatedDateTime}${p1.endsWith('</ul>') ? '</ul>' : '</li>'}`);
    } else {
        body += `<li><b>Date/time</b>: ${moment(startTime).utcOffset(Number(timezoneOffset)).format('YYYY-MM-DD hh:mm:ss A')}</li>`;
    }
    return body;
}

function upsertCallDuration({ body, duration }) {
    const durationRegex = RegExp('<li><b>Duration</b>: (.+?)(?:</li>|</ul>)');
    if (durationRegex.test(body)) {
        body = body.replace(durationRegex, (match, p1) => `<li><b>Duration</b>: ${secondsToHoursMinutesSeconds(duration)}${p1.endsWith('</ul>') ? '</ul>' : '</li>'}`);
    } else {
        body += `<li><b>Duration</b>: ${secondsToHoursMinutesSeconds(duration)}</li>`;
    }
    return body;
}

function upsertCallResult({ body, result }) {
    const resultRegex = RegExp('<li><b>Result</b>: (.+?)(?:</li>|</ul>)');
    if (resultRegex.test(body)) {
        body = body.replace(resultRegex, (match, p1) => `<li><b>Result</b>: ${result}${p1.endsWith('</ul>') ? '</ul>' : '</li>'}`);
    } else {
        body += `<li><b>Result</b>: ${result}</li>`;
    }
    return body;
}

function upsertCallRecording({ body, recordingLink }) {
    const recordingLinkRegex = RegExp('<li><b>Call recording link</b>: (.+?)(?:</li>|</ul>)');
    if (recordingLink) {
        if (recordingLinkRegex.test(body)) {
            body = body.replace(recordingLinkRegex, (match, p1) => `<li><b>Call recording link</b>: <a target="_blank" href=${recordingLink}>open</a>${p1.endsWith('</ul>') ? '</ul>' : '</li>'}`);
        }
        else {
            let text = '';
            // a real link
            if (recordingLink.startsWith('http')) {
                text = `<li><b>Call recording link</b>: <a target="_blank" href=${recordingLink}>open</a></li>`;
            } else {
                // placeholder
                text = '<li><b>Call recording link</b>: (pending...)</li>';
            }
            if (body.indexOf('</ul>') === -1) {
                body += text;
            } else {
                body = body.replace('</ul>', `${text}</ul>`);
            }
        }
    }
    return body;
}

function upsertAiNote({ body, aiNote }) {
    if (!aiNote) {
        return body;
    }
    const formattedAiNote = aiNote.replace(/\n+$/, '').replace(/(?:\r\n|\r|\n)/g, '<br>');
    const aiNoteRegex = RegExp('<div><b>AI Note</b><br>(.+?)</div>');
    if (aiNoteRegex.test(body)) {
        body = body.replace(aiNoteRegex, `<div><b>AI Note</b><br>${formattedAiNote}</div>`);
    } else {
        body += `<div><b>AI Note</b><br>${formattedAiNote}</div><br>`;
    }
    return body;
}

function upsertTranscript({ body, transcript }) {
    if (!transcript) {
        return body;
    }
    const formattedTranscript = transcript.replace(/(?:\r\n|\r|\n)/g, '<br>');
    const transcriptRegex = RegExp('<div><b>Transcript</b><br>(.+?)</div>');
    if (transcriptRegex.test(body)) {
        body = body.replace(transcriptRegex, `<div><b>Transcript</b><br>${formattedTranscript}</div>`);
    } else {
        body += `<div><b>Transcript</b><br>${formattedTranscript}</div><br>`;
    }
    return body;
}

async function updateCategoryToUserSetting({ user, authHeader }) {
    const categoriesResp = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/lists/categories`,
        {
            headers: { 'Authorization': authHeader }
        });
    const activeCategories = categoriesResp.data.categories.filter(c => !c.deleted);
    let updatedSettings = {
        ...(user.userSettings || {})
    };
    updatedSettings.defaultCategory = {
        value: updatedSettings.defaultCategory?.value ?? 2,
        customizable: updatedSettings.defaultCategory?.customizable ?? true,
        options: activeCategories.map(c => {
            return {
                id: c.id,
                name: c.name
            }
        })
    }
    await user.update({
        userSettings: updatedSettings
    });
}

exports.getAuthType = getAuthType;
exports.getBasicAuth = getBasicAuth;
exports.getUserInfo = getUserInfo;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.getCallLog = getCallLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;
exports.findContactWithName = findContactWithName;
