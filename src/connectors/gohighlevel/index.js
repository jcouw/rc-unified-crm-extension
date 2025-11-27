const axios = require('axios');
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');
const { secondsToHoursMinutesSeconds } = require('@app-connect/core/lib/util');
const composer = require('@app-connect/core/lib/callLogComposer');
const ClientOAuth2 = require('client-oauth2');
const { cat } = require('shelljs');
const { UserModel } = require('@app-connect/core/models/userModel');


// -----------------------------------------------------------------------------------------------
// ---TODO: Delete below mock entities and other relevant code, they are just for test purposes---
// -----------------------------------------------------------------------------------------------
let mockContact = null;
let mockCallLog = null;
let mockMessageLog = null;

// conversationProviderid retrieved from the marketplace.gohighlevel.com/apps page where the app is listed, see Modules -> Conversation Providers 
// const ghl_conversationProviderId = '67e16cc7b800d72febe0d461';  // <--- conversation provider ID Standard App
const ghl_conversationProviderId = '6853f2db10bae463873af7cf';  // <--- conversation provider ID for Calls forWhitelabel App
const ghl_conversationProviderId_SMS = '685e7955798806d4a499d2f3';  // <--- conversation provider ID for SMS for Whitelabel App
const ghl_api_version = '2021-07-28';


function getAuthType() {
    return 'oauth'; // Return either 'oauth' OR 'apiKey'
}

// CHOOSE: If using OAuth
async function getOauthInfo() {
    console.log(`[RC App] getOauthInfo`, process.env.GHL_CLIENT_ID, process.env.GHL_CLIENT_SECRET, process.env.GHL_TOKEN_URI, process.env.GHL_REDIRECT_URI);
    return {
        clientId: process.env.GHL_CLIENT_ID,
        clientSecret: process.env.GHL_CLIENT_SECRET,
        accessTokenUri: process.env.GHL_TOKEN_URI,
        redirectUri: process.env.GHL_REDIRECT_URI
    }
}
exports.getOauthInfo = getOauthInfo;

// CHOOSE: If using OAuth somehow uses query not body to pass code
function getOverridingOAuthOption({ code }) {
    console.log("[RC App] getOverridingOAuthOption");
    return {
        useBodyAuth: true
    }
}


// For params, if OAuth, then accessToken, refreshToken, tokenExpiry; If apiKey, then apiKey
// ------------
// - additionalInfo: contains custom additional fields on auth page (eg. username and password for redtail)
// ------------
// Optional input params:
// - oauth: tokenUrl, apiUrl, hostname
// - apiKey: hostname
async function getUserInfo({ authHeader, additionalInfo, data }) {
    console.log(`[RC App] getUserInfo`, authHeader, additionalInfo, data);

    if (!additionalInfo)
        additionalInfo = {};

    additionalInfo.ghl_locationId = data.locationId;

    try {
        const userResp = await getGHLUser(authHeader, data.userId);

        if (!userResp)
            throw new Error("GoHighLevel API returned invalid response");

        const id = data.userId;
        const name = userResp.name ?? 'unknown user';
        const email = userResp.email;

        console.log(`[RC App] getUserInfo going to return`);

        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                email,
                platformAdditionalInfo: additionalInfo
            },
            returnMessage: {
                messageType: 'success',
                message: 'Successfully connected to GoHighLevel.',
                ttl: 1000
            }
        };
    }
    catch (e) {
        console.error("[RC App] getUserInfo error:", e);
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Could not load user information',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `GoHighLevel was unable to fetch information for the currently logged in user. Please check your permissions in GoHighLevel and make sure you have permission to access and read user information.`
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
    console.log("[RC App] unAuthorize");
    await user.destroy();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of GoHighLevel',
            ttl: 1000
        }
    }
}

//  - phoneNumber: phone number in E.164 format
//  - overridingFormat: optional, if you want to override the phone number format
async function findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension }) {
    console.log('[RC App] findContact', phoneNumber, overridingFormat, isExtension);

    try {
        const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
        if (phoneNumberObj.valid)
            phoneNumber = phoneNumberObj.number.e164;

        const matchedContactInfo = [];
        phoneNumber = phoneNumber.trim();
        console.log(`[RC App] phone number: ${phoneNumber}`);

        let searchResponse = null;
        searchResponse = await searchGHLContact(user, authHeader, phoneNumber);

        if (searchResponse && searchResponse.contacts.length > 0) {
            const contacts = searchResponse.contacts;
            for (var c of contacts) {
                matchedContactInfo.push({
                    id: c.id,
                    name: `${c.firstNameLowerCase ? c.firstNameLowerCase.charAt(0).toUpperCase() + c.firstNameLowerCase.slice(1) : ''} ${c.lastNameLowerCase || ''}`.trim(),
                    type: user.platformAdditionalInfo.ghl_locationId, // abuse type to store locationId, need this value in manifest for contactPageUrl setting
                    phone: c.phone,
                    additionalInfo: null
                })
            }
        } else {

            // [2025-06-27] DISABLED, talked with Byrne Reese. Maybe in the future RC will add a setting "auto-create contact"...
            // let contactResponse = null
            // contactResponse = await createGHLContact(user, authHeader, phoneNumber, `Unknown caller ${phoneNumber}`);

            // if (contactResponse) {
            //     matchedContactInfo.push({
            //         id: contactResponse.contact.id,
            //         name: (`${contactResponse.contact.firstName ?? ''} ${contactResponse.contact.lastName ?? ''}`),
            //         type: user.platformAdditionalInfo.ghl_locationId, // abuse type to store locationId, need this value in manifest for contactPageUrl setting
            //         phone: contactResponse.contact.phone,
            //         additionalInfo: null
            //     })
            // }
        }

        // If you want to support creating a new contact from the extension, below placeholder contact should be used
        matchedContactInfo.push({
            id: 'createNewContact',
            name: 'Create new Contact',
            additionalInfo: null,
            isNewContact: true
        });

        return {
            successful: true,
            matchedContactInfo,
            returnMessage: {
                messageType: 'success',
                message: 'Successfully found contact.',
                detaisl: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Found ${matchedContactInfo.length} contacts`
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        };
    } catch (error) {
        return processErrorToRC(error);
    }
}

// - contactInfo: { id, type, phoneNumber, name }
// - callLog: same as in https://developers.ringcentral.com/api-reference/Call-Log/readUserCallRecord
// - note: note submitted by user
// - additionalSubmission: all additional fields that are setup in manifest under call log page
async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript, composedLogDetails, hashedAccountId }) {
    console.log('[RC App] createCallLog', contactInfo?.id, composedLogDetails);

    // even though RC provide the getLicenseStatus interface, we still check here because we want to  display a clear notification
    try {
        console.debug('[RC App] START logActivity');
        await logActivity(user);
    } catch (error) {
        console.error('[RC App] logActivity failed');
        return processErrorToRC(error);
    }

    try {
        let convId = null;
        // Search GHL conversation based on GHL contactId
        let foundConvResp = await searchGHLConversation(authHeader, contactInfo.id);
        if (!foundConvResp || !foundConvResp.conversations || foundConvResp.conversations.length === 0) {
            // Create a GHL Conversation
            let convResp = await createGHLConversation(user, authHeader, contactInfo.id);
            convId = convResp.conversation.id;
        } else {
            convId = foundConvResp.conversations[0].id;
        }

        // Log the call datetime and To/From numbers in the conversation
        let callLogResp = null;
        if (convId) {
            callLogResp = await createGHLCallLog(authHeader, convId, callLog.from.phoneNumber, callLog.to.phoneNumber, callLog.startTime, callLog.direction === 'Inbound');
        }

        // bugfix: make sure RC adds a note even if user did not enter any note, neede to maintain note formatting for future updates
        // note = note ? note : 'not provided';
        // if (!composedLogDetails.toLowerCase().startsWith('- note:'))
        //     composedLogDetails = `- Note: ${note}\n${composedLogDetails}`;

        const callLogNoteResponse = await createGHLNote(authHeader, composedLogDetails, user.id, contactInfo.id);

        return {
            // logId: contactInfo.id + '-' + callLogNoteResponse.note.id,
            logId: callLogNoteResponse.note.id,
            returnMessage: {
                message: 'Call logged',
                messageType: 'success',
                ttl: 2000
            }
        };
    } catch (error) {
        return processErrorToRC(error);
    }
}

async function getCallLog({ user, callLogId, contactId, authHeader }) {
    console.log('[RC App] getCallLog', callLogId);

    try {
        let callLogNoteId = callLogId;
        let getLogRes = {};
        if (contactId) {
            let noteResp = null
            noteResp = await getGHLNote(authHeader, contactId, callLogNoteId);

            // // split note, we expect the note to have "subject, then newlines, then actual note"
            // // unfortunately GHL only has a note body so this is the only way
            // const result = splitAtFirstNewline(noteResp.note.body);
            // let note = '';
            // if (noteResp.note.body.indexOf('- Agent note: ') > -1) {
            //     note = noteResp.note.body.split('- Agent note: ')[1];
            // }

            // getLogRes = { subject: result.part1, note: note };

            let subjectRegex = /- Summary: ([^\n]*)\n*/;
            let match = subjectRegex.exec(noteResp.note.body);
            let existingSubject = null;
            if (match && match[1] !== undefined) {
                // match[0] is the entire match ('- Summary: Existing Call Subject Text\n')
                // match[1] is the content of the first capturing group ('Existing Call Subject Text')
                existingSubject = match[1].trim();
                console.log(`Extracted Subject: "${existingSubject}"`);
            } else {
                console.log("[RC App] Subject not found or empty.");
            }

            const noteRegex = /- (?:Note|Agent notes): ([\s\S]*?)(?=\n- [A-Z][a-zA-Z\s/]*:|\n$|$)/;
            match = noteRegex.exec(noteResp.note.body);
            let existingNote = null;
            if (match && match[1] !== undefined) {
                existingNote = match[1].trim();
                console.log(`Extracted Note: "${existingNote}"`);
            } else {
                console.log("[RC App] Note not found or empty.");
            }

            getLogRes = { subject: existingSubject, note: existingNote };
            console.log("[RC App] getCallLog returning", getLogRes);
        }

        return {
            callLogInfo: {
                subject: getLogRes.subject,
                note: getLogRes.note
            },
            returnMessage: {
                message: 'Call log fetched.',
                messageType: 'success',
                ttl: 3000
            }
        }
    } catch (error) {
        return processErrorToRC(error);
    }
}

// - note: note submitted by user
// - subject: subject submitted by user
// - startTime: more accurate startTime will be patched to this update function shortly after the call ends
// - duration: more accurate duration will be patched to this update function shortly after the call ends
// - result: final result will be patched to this update function shortly after the call ends
// - recordingLink: recordingLink updated from RingCentral. It's separated from createCallLog because recordings are not generated right after a call. It needs to be updated into existing call log
async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript, legs, additionalSubmission, composedLogDetails, existingCallLogDetails, hashedAccountId, isFromSSCL, ringSenseTranscript, ringSenseSummary, ringSenseAIScore, ringSenseBulletedSummary, ringSenseLink }) {
    console.log('[RC App] updateCallLog', note ? 'hasnote' : 'no note');
    console.log('[RC App] updateCallLog composedLogDetails', composedLogDetails);

    try {
        let callLogNoteId = existingCallLog.thirdPartyLogId;
        let contactId = existingCallLog.contactId;
        // let splitted = existingCallLog.thirdPartyLogId.split('-');
        // let contactId = null;
        // let callLogNoteId = null;
        // if (splitted.length > 1) {
        //     contactId = splitted[0];
        //     callLogNoteId = splitted[1];
        //     console.log('[RC App] updateCallLog got ids', contactId, callLogNoteId);
        // }

        let noteResp = null
        noteResp = await getGHLNote(authHeader, contactId, callLogNoteId);

        let logBody = noteResp.note.body;
        if (!!subject && (user.userSettings?.addCallLogSubject?.value ?? true)) { logBody = composer.upsertCallSubject({ body: logBody, subject, logFormat: user.userSettings?.logFormat }); }
        if (!!startTime && (user.userSettings?.addCallLogDateTime?.value ?? true)) { logBody = composer.upsertCallDateTime({ body: logBody, startTime, logFormat: user.userSettings?.logFormat }); }
        if (!!duration && (user.userSettings?.addCallLogDuration?.value ?? true)) { logBody = composer.upsertCallDuration({ body: logBody, duration, logFormat: user.userSettings?.logFormat }); }
        if (!!result && (user.userSettings?.addCallLogResult?.value ?? true)) { logBody = composer.upsertCallResult({ body: logBody, result, logFormat: user.userSettings?.logFormat }); }
        if (!!recordingLink && (user.userSettings?.addCallLogRecording?.value ?? true)) { logBody = composer.upsertCallRecording({ body: logBody, recordingLink, logFormat: user.userSettings?.logFormat }); }
        if (!!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true)) { logBody = composer.upsertAiNote({ body: logBody, aiNote, logFormat: user.userSettings?.logFormat }); }
        if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { logBody = composer.upsertTranscript({ body: logBody, transcript, logFormat: user.userSettings?.logFormat }); }
        if (user.userSettings?.addCallLogNote?.value ?? true) { logBody = composer.upsertCallAgentNote({ body: logBody, note: note, logFormat: user.userSettings?.logFormat }); }
        if (user.userSettings?.addCallSessionId?.value ?? true) { logBody = composer.upsertCallSessionId({ body: logBody, id: existingCallLog.sessionId, logFormat: user.userSettings?.logFormat }); }

        const ringcentralUsername = (existingCallLog.direction === 'Inbound' ? existingCallLog?.to?.name : existingCallLog?.from?.name) ?? null;
        if (ringcentralUsername) {
            if (user.userSettings?.addRingCentralUserName?.value ?? true) { logBody = composer.upsertRingCentralUserName({ body: logBody, id: existingCallLog.sessionId, logFormat: user.userSettings?.logFormat }); }
        }

        if (user.userSettings?.addRingCentralNumber?.value ?? false) {
            const ringcentralNumber = existingCallLog.direction === 'Inbound' ? existingCallLog?.to?.phoneNumber : existingCallLog?.from?.phoneNumber;
            if (ringcentralNumber) {
                const ringcentralExtensionNumber = existingCallLog.direction === 'Inbound' ? existingCallLog?.from?.extensionNumber : existingCallLog?.to?.extensionNumber;
                if (user.userSettings?.addRingCentralUserName?.value ?? true) { logBody = composer.upsertRingCentralNumberAndExtension({ body: logBody, extension: ringcentralExtensionNumber ?? '', logFormat: user.userSettings?.logFormat }); }
            }
        }

        console.log('[RC App] updateCallLog user.userSettings?.addCallLogLegs?.value', user.userSettings?.addCallLogLegs?.value);
        console.log('[RC App] updateCallLog existingCallLog.legs', legs);

        if (user.userSettings?.addCallLogLegs?.value ?? true) { logBody = composer.upsertLegs({ body: logBody, legs: legs, logFormat: user.userSettings?.logFormat }); }
        if (user.userSettings?.addCallLogRingSenseRecordingTranscript?.value ?? true) { logBody = composer.upsertRingSenseTranscript({ body: logBody, transcript: ringSenseTranscript, logFormat: user.userSettings?.logFormat }); }
        if (user.userSettings?.addCallLogRingSenseRecordingSummary?.value ?? true) { logBody = composer.upsertRingSenseSummary({ body: logBody, summary: ringSenseSummary, logFormat: user.userSettings?.logFormat }); }
        if (user.userSettings?.addCallLogRingSenseRecordingAIScore?.value ?? true) { logBody = composer.upsertRingSenseAIScore({ body: logBody, score: ringSenseAIScore, logFormat: user.userSettings?.logFormat }); }
        if (user.userSettings?.addCallLogRingSenseRecordingBulletedSummary?.value ?? true) { logBody = composer.upsertRingSenseBulletedSummary({ body: logBody, summary: ringSenseBulletedSummary, logFormat: user.userSettings?.logFormat }); }
        if (user.userSettings?.addCallLogRingSenseRecordingLink?.value ?? true) { logBody = composer.upsertRingSenseLink({ body: logBody, link: ringSenseLink, logFormat: user.userSettings?.logFormat }); }

        await updateGHLNote(authHeader, logBody, user.id, contactId, callLogNoteId);

        return {
            updatedNote: note,
            returnMessage: {
                message: 'Call log updated.',
                messageType: 'success',
                ttl: 3000
            }
        };
    } catch (error) {
        return processErrorToRC(error);
    }
}

// Important: Is for SMS, Fax and Voicemail. SMS is only delivered once per 24 hours to prevent overloading the CRM API
//            GHL actually supports storing inbound/outbound SMS via API so instead of bundling it into a conversation ourselves (like for freshdesk), we send in seperate messages
// - contactInfo: { id, type, phoneNumber, name }
// - message : same as in https://developers.ringcentral.com/api-reference/Message-Store/readMessage
// - recordingLink: recording link of voice mail
// - additionalSubmission: all additional fields that are setup in manifest under call log page
async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    console.log('[RC App] createMessageLog');

    // even though RC provide the getLicenseStatus interface, we still check here because we want to  display a clear notification
    try {
        console.debug('[RC App] START logActivity');
        await logActivity(user);
    } catch (error) {
        console.error('[RC App] logActivity failed');
        return processErrorToRC(error);
    }


    try {
        const messageType = !!recordingLink ? 'Voicemail' : (!!faxDocLink ? 'Fax' : 'SMS');
        let subject = '';
        let note = '';
        switch (messageType) {
            case 'SMS':
                subject = `SMS from ${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : message.to[0].name} to ${message.direction !== 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : message.to[0].name}`;
                note = message.subject;
                // `<br><b>${subject}</b><br>` +
                // '<b>Conversation summary</b><br><br>' +
                // `${moment(message.creationTime).utcOffset(user.timezoneOffset ?? 0).format('dddd, MMMM DD, YYYY')}<br>` +
                // 'Participants<br>' +
                // `<ul><li>To: ${message.to[0].name}</li>` +
                // `<li>From: ${contactInfo.name}</li></ul>` +
                // 'Conversation(1 messages)<br>' +
                // 'BEGIN<br>' +
                // '------------<br>' +
                // `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(user.timezoneOffset ?? 0).format('hh:mm A')}<br>` +
                // `<b>${message.subject}</b>` +
                // '------------<br>' +
                // 'END<br><br>';
                break;
            case 'Fax':
                subject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).utcOffset(user.timezoneOffset ?? 0).format('YYYY-MM-DD')}`;
                note = `<br><b>${subject}</b><br>Fax document link: ${faxDocLink}`;
                break;
            case 'Voicemail':
                // GHL does not support html anchor elements so we use the recording link as-is
                subject = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).utcOffset(user.timezoneOffset ?? 0).format('YYYY-MM-DD hh:mm:ss A')}`;
                note = `<br><b>${subject}</b><br>Voicemail recording link: ${recordingLink}`;
                break;
        }

        note = subject + '<br>' + note;

        let convId = null;
        // Search GHL conversation based on GHL contactId
        let foundConvResp = await searchGHLConversation(authHeader, contactInfo.id);
        if (!foundConvResp || !foundConvResp.conversations || foundConvResp.conversations.length === 0) {

            // Create a GHL Conversation
            let convResp = await createGHLConversation(user, authHeader, contactInfo.id);
            convId = convResp.conversation.id;

        } else {
            convId = foundConvResp.conversations[0].id;
        }

        // create an actual message in the GHL conversation for SMS as they support that as an actual message type including the SMS content
        // create a note in GHL for the message log only for FAX and VOICEMAIL, as GHL does NOT support this in the conversation stream
        let returnId = null;
        if (messageType === 'SMS') {
            const callLogResp = await createGHLCallLog(authHeader, convId, contactInfo.phoneNumber, message.to[0].phoneNumber, message.creationTime, message.direction === 'Inbound', 'SMS', note);
            returnId = callLogResp?.messageId;
        }
        else if (messageType === 'Fax' || messageType === 'Voicemail') {
            const callLogNoteResponse = await createGHLNote(authHeader, note, user.id, contactInfo.id);
            returnId = callLogNoteResponse?.note?.id;
        }


        return {
            logId: contactInfo.id + '-' + returnId,
            returnMessage: {
                message: 'Message log added.',
                messageType: 'success',
                ttl: 3000
            }
        };
    } catch (error) {
        return processErrorToRC(error);
    }
}

// Used to update existing message log so to group message in the same day together
async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
    console.log('[RC App] updateMessageLog, going to call createMessageLog as handling is the same');
    return createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission: null, recordingLink: null, faxDocLink: null });
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    console.log('[RC App] createContact');

    let contactResponse = await createGHLContact(user, authHeader, phoneNumber, newContactName);

    return {
        contactInfo: {
            id: contactResponse.contact.id,
            name: newContactName
        },
        returnMessage: {
            message: `New contact created.`,
            messageType: 'success',
            ttl: 3000
        }
    }
}

// implemented this to prevent framework error: "platformModule.upsertCallDisposition is not a function"
async function upsertCallDisposition({ user, existingCallLog, authHeader, dispositions }) {
    const logId = existingCallLog.thirdPartyLogId;
    return {
        logId: logId
    }
}

async function getLicenseStatus({ userId }) {
    console.log("[RC App] getLicenseStatus");
    let result = {
        isLicenseValid: true,
        licenseStatus: 'Basic',
        licenseStatusDescription: null
    }

    try {
        // to do: continue work on this as soon as RC provides a user input param because we need the user.platformAdditionalInfo.ghl_locationId
        const user = await UserModel.findByPk(userId);
        await logActivity(user);
    } catch (error) {
        console.error("[RC App] getLicenseStatus error:", error);

        result.isLicenseValid = false;
        result.licenseStatus = 'Invalid';
        result.licenseStatusDescription = error.message;
    }

    return result;
}


//#region Helper functions
// The RC interface functions can handle errors but we need to return it in the response
function splitAtFirstNewline(str) {
    // This regex matches everything up to the first newline(s), then the rest
    const match = str.match(/^([\s\S]*?)(\r?\n)+([\s\S]*)$/);
    if (match) {
        return {
            part1: match[1],
            part2: match[3]
        };
    }
    // If no newline found, return the whole string as part1, part2 is empty
    return {
        part1: str,
        part2: ''
    };
}
function processErrorToRC(error) {
    console.debug('[RC App] processErrorToRC', error);
    return {
        logId: '1234',
        returnMessage: {
            message: error.message,
            messageType: 'danger',
            ttl: 3000
        }
    };
}
//#endregion


//#region Helper functions for upserts to GHL data structures
function getSubjectFromNoteHtml(noteHtml) {
    const regex = /^([\s\S]*?\n)/;

    const match = noteHtml.match(regex);
    if (match) {
        return match[1];
    }

    return "";
}

function upsertSubject({ body, subject }) {
    const subjectRegex = /^([\s\S]*?\n)/;
    if (subjectRegex.test(body)) {
        body = body.replace(subjectRegex, `${subject}\n`);
    } else {
        body += `${subject}\n`;
    }
    return body;
}

function upsertAgentNoteSubject({ body, subject }) {
    const subjectRegex = /^([\s\S]*?\n)/;
    if (subjectRegex.test(body)) {
        body = body.replace(subjectRegex, `${subject}\n`);
    } else {
        body += `${subject}\n`;
    }
    return body;
}

function upsertCallAgentNote({ body, note }) {
    if (!!!note) {
        return body;
    }

    const noteRegex = RegExp('- Agent note: ([\\s\\S]*)');
    if (noteRegex.test(body)) {
        body = body.replace(noteRegex, `- Agent note: ${note}`);
    }
    else {
        body += `- Agent note: ${note}\n`;
    }
    return body;
}
function upsertContactPhoneNumber({ body, phoneNumber, direction }) {
    const phoneNumberRegex = RegExp('- Contact Number: (.+?)\n');
    if (phoneNumberRegex.test(body)) {
        body = body.replace(phoneNumberRegex, `- Contact Number: ${phoneNumber}\n`);
    } else {
        body += `- Contact Number: ${phoneNumber}\n`;
    }
    return body;
}
function upsertCallDateTime({ body, startTime, timezoneOffset }) {
    const dateTimeRegex = RegExp('- Date/time: (.+?)\n');
    if (dateTimeRegex.test(body)) {
        const updatedDateTime = moment(startTime).utcOffset(timezoneOffset ?? 0).format('YYYY-MM-DD hh:mm:ss A');
        body = body.replace(dateTimeRegex, `- Date/time: ${updatedDateTime}\n`);
    } else {
        const updatedDateTime = moment(startTime).utcOffset(timezoneOffset ?? 0).format('YYYY-MM-DD hh:mm:ss A');
        body += `- Date/time: ${updatedDateTime}\n`;
    }
    return body;
}
function upsertCallResult({ body, result }) {
    const resultRegex = RegExp('- Result: (.+?)\n');
    if (resultRegex.test(body)) {
        body = body.replace(resultRegex, `- Result: ${result}\n`);
    } else {
        body += `- Result: ${result}\n`;
    }
    return body;
}
function upsertCallDuration({ body, duration }) {
    // const durationRegex = RegExp('- Duration: (.+?)\n');
    const durationRegex = RegExp('- Duration: (.*?)\n');
    if (durationRegex.test(body)) {
        body = body.replace(durationRegex, `- Duration: ${secondsToHoursMinutesSeconds(duration)}\n`);
    } else {
        body += `- Duration: ${secondsToHoursMinutesSeconds(duration)}\n`;
    }
    return body;
}
function upsertCallRecording({ body, recordingLink }) {
    const recordingLinkRegex = RegExp('- Call recording link: (.+?)\n');
    if (!!recordingLink && recordingLinkRegex.test(body)) {
        body = body.replace(recordingLinkRegex, `- Call recording link: ${recordingLink}\n`);
    } else if (!!recordingLink) {
        body += `- Call recording link: ${recordingLink}\n`;
    }
    return body;
}
function upsertAiNote({ body, aiNote }) {
    const aiNoteRegex = RegExp('- AI Note:([\\s\\S]*?)--- END');
    const clearedAiNote = aiNote.replace(/\n+$/, '');
    if (aiNoteRegex.test(body)) {
        body = body.replace(aiNoteRegex, `- AI Note:\n${clearedAiNote}\n--- END`);
    } else {
        body += `- AI Note:\n${clearedAiNote}\n--- END\n`;
    }
    return body;
}

function upsertTranscript({ body, transcript }) {
    const transcriptRegex = RegExp('- Transcript:([\\s\\S]*?)--- END');
    if (transcriptRegex.test(body)) {
        body = body.replace(transcriptRegex, `- Transcript:\n${transcript}\n--- END`);
    } else {
        body += `- Transcript:\n${transcript}\n--- END\n`;
    }
    return body;
}
//#endregion


//#region GoHighLevel API functions
function getApiUrl() {
    return `https://services.leadconnectorhq.com`;
}

async function makeRequestWithRetry({ method, url, payload = null, headers = {}, retries = 3, delay = 2000 }) {
    console.debug(`[RC App] GHL api call`, method, url, payload);
    let lastError = null;
    // GoHighLevel API requires a specific version
    headers.Version = ghl_api_version;

    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios({ method, url, headers, data: payload });
            return response.data; // Success: return API response data
        } catch (error) {
            lastError = error; // Store last error
            if (error.response && error.response.status === 429) {
                console.warn(`[API] Rate limited (429) - Retrying in ${delay}ms...`);
                await new Promise(res => setTimeout(res, delay)); // Delay before retry
            } else {
                if (error?.response?.data?.message)
                    throw new Error(error.response.data.message); // If the error has a message, throw it
                throw error; // Other errors, throw immediately
            }
        }
    }

    // If all retries exhausted due to rate limiting, return a specific error
    if (lastError && lastError.response && lastError.response.status === 429) {
        console.warn("[RC App] GoHighLevel API Rate Limit reached.");
        throw new Error("GoHighLevel Rate limit reached.");
    }

    // If a different error happened (shouldn't reach here normally)
    throw lastError;
}

// https://highlevel.stoplight.io/docs/integrations/a815845536249-get-user
async function getGHLUser(authHeader, userId) {
    let url = `${getApiUrl()}/users/${userId}`;
    return await makeRequestWithRetry({
        method: "GET",
        url,
        headers: { 'Authorization': authHeader }
    });
}

async function getGHLNote(authHeader, contactId, noteId) {
    let url = `${getApiUrl()}/contacts/${contactId}/notes/${noteId}`;
    return await makeRequestWithRetry({
        method: "GET",
        url,
        headers: { 'Authorization': authHeader }
    });
}

async function searchGHLContact(user, authHeader, phoneNumber) {
    phoneNumber = phoneNumber.trim().replace(/[-()]/g, '');

    let payload = {
        locationId: user.platformAdditionalInfo.ghl_locationId,
        pageLimit: 10,
        filters: [
            {
                field: "phone",
                operator: "contains",
                value: phoneNumber
            }
        ]
    };

    // also include a search with '+' prefix
    if (!phoneNumber.startsWith('+')) {
        payload.filters.push({
            field: "phone",
            operator: "contains",
            value: `+${phoneNumber}`
        });
    }

    let url = `${getApiUrl()}/contacts/search`;
    return await makeRequestWithRetry({
        method: "POST",
        payload: payload,
        url,
        headers: { 'Authorization': authHeader }
    });
}

async function createGHLContact(user, authHeader, phoneNumber, newContactName) {
    phoneNumber = phoneNumber.trim();
    let payload = {
        locationId: user.platformAdditionalInfo.ghl_locationId,
        name: newContactName,
        phone: phoneNumber
    };

    let url = `${getApiUrl()}/contacts`;
    return await makeRequestWithRetry({
        method: "POST",
        payload: payload,
        url,
        headers: { 'Authorization': authHeader }
    });
}

// Create a conversation in GHL for the give contact. Only used to log the call datetime and To/From numbers.
// We will call this instead of checking if a Conversation record already exists. So errors like 'Conversation with the contact id:xxx already exists'could occur in the logs
// response will contain a conversationId property needed to actually log the call later on
async function createGHLConversation(user, authHeader, contactId) {
    let payload = {
        locationId: user.platformAdditionalInfo.ghl_locationId,
        contactId: contactId
    };

    let url = `${getApiUrl()}/conversations/`;
    return await makeRequestWithRetry({
        method: "POST",
        payload: payload,
        url,
        headers: { 'Authorization': authHeader }
    });
}

async function searchGHLConversation(authHeader, contactId) {
    let url = `${getApiUrl()}/conversations/search?contactId=${contactId}`;
    return await makeRequestWithRetry({
        method: "GET",
        url,
        headers: { 'Authorization': authHeader }
    });
}

// Used to log the call in the Conversation in GHL for the give contact. Only used to log the call datetime and To/From numbers.
async function createGHLCallLog(authHeader, conversationId, from, to, creationTime, isInbound, type = 'Call', msg) {
    let payload = {
        type: type,
        conversationId: conversationId,
        conversationProviderId: ghl_conversationProviderId,
        call: {
            to: to,
            from: from
        },
        direction: isInbound ? 'inbound' : 'outbound',
    };

    if (msg)
        payload.message = msg;

    if (creationTime) {
        const isoDateString = new Date(creationTime).toISOString();
        payload.date = isoDateString;
    }

    let url = `${getApiUrl()}/conversations/messages/`;

    // only change url if it is for a call, for SMS it seems we can just call /inbound icw with the 'direction' prop in the payload
    if (type === 'Call') {
        if (isInbound)
            url += `inbound`;
        else
            url += `outbound`;
    } else if (type === 'SMS') {
        url += `inbound`;
        payload.conversationProviderId = ghl_conversationProviderId_SMS; // use a different conversation provider for SMS
    }


    return await makeRequestWithRetry({
        method: "POST",
        payload: payload,
        url,
        headers: { 'Authorization': authHeader }
    });
}

// used to add a note that contains call log data because the conversation message itself in GHL does not support providing information for call types
async function createGHLNote(authHeader, htmlBody, userId, contactId) {
    let payload = {
        userId: userId,
        body: htmlBody
    };

    let url = `${getApiUrl()}/contacts/${contactId}/notes`;
    return await makeRequestWithRetry({
        method: "POST",
        payload: payload,
        url,
        headers: { 'Authorization': authHeader }
    });
}

// used to update either the agent manual note record of the RC call log note
async function updateGHLNote(authHeader, body, userId, contactId, noteId) {
    let payload = {
        userId: userId,
        body: body
    };

    let url = `${getApiUrl()}/contacts/${contactId}/notes/${noteId}`;
    return await makeRequestWithRetry({
        method: "PUT",
        payload: payload,
        url,
        headers: { 'Authorization': authHeader }
    });
}
//#endregion


//#region Helper functions - Misc
function isEmpty(val) {
    return val === undefined || val === null || val.length <= 0 ? true : false;
}

function getLogActivityUrl(crmProduct, phoneProduct, userID, domain, version) {
    if (isEmpty(crmProduct) || isEmpty(phoneProduct) || isEmpty(userID) || isEmpty(domain) || isEmpty(version)) {
        console.error("Check your variables, one or more variable in getLogActivityUrl is invalid.");
        return null;
    } else {
        let beginURLProduction = "https://development.loyally.nl/licence-tracker/api/logactivity/v3";

        let URL =
            beginURLProduction +
            "?CrmProduct=" +
            crmProduct +
            "&PhoneProduct=" +
            phoneProduct +
            "&UserID=" +
            userID +
            "&Domain=" +
            domain +
            "&Version=" +
            version;
        return URL;
    }
}

// please note that GHL does not work on subdomains so we check based on the locationId related to the GHL sub-account
async function logActivity(user) {
    if (!user || !user.platformAdditionalInfo || !user.platformAdditionalInfo.ghl_locationId) {
        // it seems the initial getLicenseStatus() call that executes this function causes this sometimes
        console.warn("[RC App] logActivity skipped, user or locationId missing", user);
        return;
    }

    let result = null;
    const crmProduct = "GoHighLevel";
    const telephonyPlatform = "RingcentralAppConnect";
    const currentVersion = "1.0.0";
    const url = getLogActivityUrl(crmProduct, telephonyPlatform, user.id, user.platformAdditionalInfo.ghl_locationId, currentVersion);

    try {
        await axios.post(url, user, { headers: { "Content-Type": "application/json; charset=utf-8" }, cache: false });
        console.log("[RC App] LogActivity Ok.");
    } catch (error) {
        if (error.response && error.response.status === 409) {
            console.warn("[RC App] Not whitelisted for usage!");
            throw new Error("Unauthorized use please contact info@loyally.eu. Subscribe [here](https://buy.stripe.com/9B614n1OBgat8d701LdUY0X) and leave your account info [here](https://loyally.eu/ringcentral-app-connect-setup)");
        }
        throw error; // Ensure other errors are also propagated
    }
}
//#endregion


exports.getAuthType = getAuthType;
exports.getUserInfo = getUserInfo;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;
exports.getOverridingOAuthOption = getOverridingOAuthOption;
exports.upsertCallDisposition = upsertCallDisposition;
exports.getLicenseStatus = getLicenseStatus;
