/* eslint-disable no-param-reassign */
const ClientOAuth2 = require('client-oauth2');
const moment = require('moment');
const axios = require('axios');
const { UserModel } = require('../models/userModel');
const adapterRegistry = require('../adapter/registry');
const dynamoose = require('dynamoose');

// oauthApp strategy is default to 'code' which use credentials to get accessCode, then exchange for accessToken and refreshToken.
// To change to other strategies, please refer to: https://github.com/mulesoft-labs/js-client-oauth2
function getOAuthApp({ clientId, clientSecret, accessTokenUri, authorizationUri, redirectUri, scopes }) {
    return new ClientOAuth2({
        clientId: clientId,
        clientSecret: clientSecret,
        accessTokenUri: accessTokenUri,
        authorizationUri: authorizationUri,
        redirectUri: redirectUri,
        scopes: scopes
    });
}


async function checkAndRefreshAccessToken(oauthApp, user, tokenLockTimeout = 20) {
    const now = moment();
    const tokenExpiry = moment(user.tokenExpiry);
    const expiryBuffer = 2; // 2 minutes
    // Special case: Bullhorn
    if (user.platform) {
        const platformModule = adapterRegistry.getAdapter(user.platform);
        if (platformModule.checkAndRefreshAccessToken) {
            return platformModule.checkAndRefreshAccessToken(oauthApp, user, tokenLockTimeout);
        }
    }
    // Other CRMs - check if token will expire within the buffer time
    if (user && user.accessToken && user.refreshToken && tokenExpiry.isBefore(now.clone().add(expiryBuffer, 'minutes'))) {
        let newLock;
        // case: use dynamoDB to manage token refresh lock
        if (process.env.USE_TOKEN_REFRESH_LOCK === 'true') {
            const { Lock } = require('../models/dynamo/lockSchema');
            // Try to atomically create lock only if it doesn't exist
            try {
                newLock = await Lock.create(
                    {
                        userId: user.id,
                        ttl: now.unix() + 30
                    },
                    {
                        overwrite: false
                    }
                );
                console.log('lock created')
            } catch (e) {
                // If creation failed due to condition, a lock exists
                if (e.name === 'ConditionalCheckFailedException' || e.__type === 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException') {
                    let lock = await Lock.get({ userId: user.id });
                    if (!!lock?.ttl && moment(lock.ttl).unix() < now.unix()) {
                        // Try to delete expired lock and create a new one atomically
                        try {
                            console.log('lock expired.')
                            await lock.delete();
                            newLock = await Lock.create(
                                {
                                    userId: user.id,
                                    ttl: now.unix() + 30
                                },
                                {
                                    overwrite: false
                                }
                            );
                        } catch (e2) {
                            if (e2.name === 'ConditionalCheckFailedException' || e2.__type === 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException') {
                                // Another process created a lock between our delete and create
                                lock = await Lock.get({ userId: user.id });
                            } else {
                                throw e2;
                            }
                        }
                    }

                    if (lock && !newLock) {
                        let processTime = 0;
                        let delay = 500; // Start with 500ms
                        const maxDelay = 8000; // Cap at 8 seconds
                        while (!!lock && processTime < tokenLockTimeout) {
                            await new Promise(resolve => setTimeout(resolve, delay));
                            processTime += delay / 1000; // Convert to seconds for comparison
                            delay = Math.min(delay * 2, maxDelay); // Exponential backoff with cap
                            lock = await Lock.get({ userId: user.id });
                        }
                        // Timeout -> let users try another time
                        if (processTime >= tokenLockTimeout) {
                            throw new Error('Token lock timeout');
                        }
                        user = await UserModel.findByPk(user.id);
                        console.log('locked. bypass')
                        return user;
                    }
                } else {
                    throw e;
                }
            }
            const startRefreshTime = moment();
            const token = oauthApp.createToken(user.accessToken, user.refreshToken);
            console.log('token refreshing...')
            const { accessToken, refreshToken, expires } = await token.refresh();
            user.accessToken = accessToken;
            user.refreshToken = refreshToken;
            user.tokenExpiry = expires;
            await user.save();
            if (newLock) {
                const deletionStartTime = moment();
                await newLock.delete();
                const deletionEndTime = moment();
                console.log(`lock deleted in ${deletionEndTime.diff(deletionStartTime)}ms`)
            }
            const endRefreshTime = moment();
            console.log(`token refreshing finished in ${endRefreshTime.diff(startRefreshTime)}ms`)
        }
        // case: run without token refresh lock
        else {

            if (user.platform === 'gohighlevel') {
                const params = new URLSearchParams();
                params.append('client_id', process.env.GHL_CLIENT_ID);
                params.append('client_secret', process.env.GHL_CLIENT_SECRET);
                params.append('grant_type', 'refresh_token');
                params.append('refresh_token', user.refreshToken);

                const refreshTokenResponse = await axios.post(process.env.GHL_TOKEN_URI, params, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                });
                const { access_token: accessToken, refresh_token: refreshToken, expires_in: expires } = refreshTokenResponse.data;
                user.accessToken = accessToken;
                user.refreshToken = refreshToken;
                const date = new Date();
                user.tokenExpiry = date.setSeconds(date.getSeconds() + expires);
                await user.save();

            } else {
                console.log('token refreshing...')
                const token = oauthApp.createToken(user.accessToken, user.refreshToken);
                const { accessToken, refreshToken, expires } = await token.refresh();
                user.accessToken = accessToken;
                user.refreshToken = refreshToken;
                user.tokenExpiry = expires;
                await user.save();
            }

            console.log('token refreshing finished')
        }

    }
    return user;
}

exports.checkAndRefreshAccessToken = checkAndRefreshAccessToken;
exports.getOAuthApp = getOAuthApp;