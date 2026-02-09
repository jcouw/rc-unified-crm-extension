const axios = require('axios');
const { AdminConfigModel } = require('../models/adminConfigModel');
const { getHashValue } = require('../lib/util');
const connectorRegistry = require('../connector/registry');

async function getUserSettingsByAdmin({ rcAccessToken, rcAccountId }) {
    let hashedRcAccountId = null;
    if (rcAccountId) {
        hashedRcAccountId = rcAccountId;
    }
    else {
        const rcExtensionResponse = await axios.get(
            'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
            {
                headers: {
                    Authorization: `Bearer ${rcAccessToken}`,
                },
            });
        hashedRcAccountId = getHashValue(rcExtensionResponse.data.account.id, process.env.HASH_KEY);
    }
    const adminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    return {
        userSettings: adminConfig?.userSettings
    };
}

async function getUserSettings({ user, rcAccessToken, rcAccountId }) {
    console.info(`[RC App] getUserSettings start`, user);
    let userSettingsByAdmin = [];
    if (rcAccessToken || rcAccountId) {
        try {
            userSettingsByAdmin = await getUserSettingsByAdmin({ rcAccessToken, rcAccountId });
        }
        catch (e) {
            userSettingsByAdmin = [];
        }
    }

    // For non-readonly admin settings, user use its own setting
    let userSettings = await user?.userSettings;

    // Parse userSettings if it's a string (to handle malformed data from DB)
    console.info(`[RC App] getUserSettings`);
    if (typeof userSettings === 'string') {
        console.info(`[RC App] getUserSettings userSettings === 'string'`);
        try {
            userSettings = JSON.parse(userSettings);
        } catch (e) {
            console.warn(`[RC App] Failed to parse userSettings for user ${user?.id}. Treating as empty object.`);
            userSettings = {};
        }
    }

    console.info('[RC App] getUserSettings is now', userSettings);

    let result = {};
    if (!userSettingsByAdmin?.userSettings) {
        result = userSettings;
    }
    else {
        if (!!userSettingsByAdmin?.userSettings && !!userSettings) {
            const keys = Object.keys(userSettingsByAdmin.userSettings).concat(Object.keys(userSettings));
            // distinct keys
            for (const key of new Set(keys)) {
                // from user's own settings
                if ((userSettingsByAdmin.userSettings[key] === undefined || userSettingsByAdmin.userSettings[key].customizable) && userSettings[key] !== undefined) {
                    result[key] = {
                        customizable: true,
                        value: userSettings[key].value,
                        defaultValue: userSettings[key].defaultValue,
                        options: userSettings[key].options
                    };
                }
                // from admin settings
                else {
                    result[key] = userSettingsByAdmin.userSettings[key];
                }
            }
        }
    }
    return result;
}

async function updateUserSettings({ user, userSettings, platformName }) {
    // --- SANITY CHECK START ---
    // If user.userSettings is corrupted (e.g., indexed-string object from malformed DB data), it will have a '0' key.
    // We must identify this and treat it as an empty object to break the corruption loop.
    let existingSettings = user.userSettings || {};
    if (typeof existingSettings === 'string') {
        try {
            existingSettings = JSON.parse(existingSettings);
        } catch (e) {
            console.warn(`[RC App] Failed to parse userSettings for user ${user.id}. Resetting to empty object.`);
            existingSettings = {};
        }
    }
    if (existingSettings['0'] === '{') {
        console.warn(`[RC App] Detected corrupted userSettings for user ${user.id}. Resetting local object to prevent spread poisoning.`);
        existingSettings = {};
    }
    // --- SANITY CHECK END ---

    let updatedSettings = {
        ...existingSettings
    };

    const keys = Object.keys(userSettings || {});
    // let updatedSettings = {
    //     ...(user.userSettings || {})
    // };
    for (const k of keys) {
        updatedSettings[k] = userSettings[k];
    }
    const platformModule = connectorRegistry.getConnector(platformName);
    if (platformModule.onUpdateUserSettings) {
        const { successful, returnMessage } = await platformModule.onUpdateUserSettings({ user, userSettings, updatedSettings });
        if (successful) {
            await user.update({
                userSettings: updatedSettings
            });
        }
        return {
            successful,
            returnMessage
        };
    }
    else {
        await user.update({
            userSettings: updatedSettings
        });
    }
    return {
        userSettings: user.userSettings
    };
}

exports.getUserSettingsByAdmin = getUserSettingsByAdmin;
exports.getUserSettings = getUserSettings;
exports.updateUserSettings = updateUserSettings;