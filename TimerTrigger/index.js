const util = require('util');
const Axios = require('axios');
const AuthenticationContext = require('adal-node').AuthenticationContext;

const REQUIRED_VAR_MSG = "'%s' environment variable is required. Exiting..";
const getParameter = (varName) => {
    const value = process.env[varName];
    if (!value) {
        console.log(util.format(REQUIRED_VAR_MSG, varName));
        process.exit(1);
    }

    return value;
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const authorityHostUrl = 'https://login.windows.net';
const tenant = getParameter('TARGET_TENANT');
const authorityUrl = authorityHostUrl + '/' + tenant;
const applicationId = getParameter('APP_ID');
const clientSecret = getParameter('APP_SECRET');
const resource = 'https://management.azure.com';
const SLACK_WEBHOOK = getParameter('SLACK_WEBHOOK');
const SLACK_CHANNEL = process.env['SLACK_CHANNEL'];
const TEAMS_WEBHOOK = getParameter('TEAMS_WEBHOOK');

const strSubscriptionsArray = process.env['TARGET_SUBSCRIPTIONS_JARRAY'];
const subscriptionsArray = strSubscriptionsArray ? JSON.parse(strSubscriptionsArray) : null;

let requestsCounter = 0;
let resultData = {};

const CostManagementClient = Axios.create({
    baseURL: 'https://management.azure.com',
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
});
const WebhookClient = Axios.create({
    //baseURL: 'https://hooks.slack.com/services',
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
});

const context = new AuthenticationContext(authorityUrl);

const getTimePeriod = () => {
    const now = new Date();
    let date = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0) - 1);
    const toDate = date.toISOString();

    date = new Date(Date.UTC(
        date.getUTCFullYear(), date.getUTCMonth(), 1,
        0, 0, 0));
    const fromDate = date.toISOString();

    return {
        from: fromDate,
        to: toDate
    };
};

const getSlackBotNameAndIcon = () => {
    const nowDate = new Date();
    const month = nowDate.getUTCMonth() + 1;
    const day = nowDate.getUTCDate();

    // New Year
    if (((month == 12) && (day >= 25)) || ((month == 1) && (day <= 3))) {
        return {
            username: 'Azure Santa',
            icon_emoji: ':santa:'
        };
    }

    // Chinese New Year
    if (((month == 1) && (day >= 20)) || ((month == 2) && (day <= 20))) {
        return {
            username: 'Azure Dragon',
            icon_emoji: ':dragon:'
        };
    }

    // Rio Carnilval
    if ((month == 3) && (day <= 9)) {
        return {
            username: 'Azure Rio Dancers',
            icon_emoji: ':dancers:'
        };
    }

    // Default mage
    return {
        username: 'Azure Mage',
        icon_emoji: ':male_mage:'
    };
};

const resolveWebhookData = (textMsg) => {
    let webhookUri = TEAMS_WEBHOOK;
    let payload = {
        text: textMsg
    };

    if (SLACK_WEBHOOK) {
        webhookUri = SLACK_WEBHOOK;

        const botIconAndName = getSlackBotNameAndIcon();
        payload = {
            text: textMsg,
            ...botIconAndName
        };

        if (SLACK_CHANNEL) {
            slackPayload.channel = SLACK_CHANNEL;
        }
    }

    return {
        webhookUri: webhookUri,
        payload: payload
    };
};

const logApiErrorAndExit = (message, errObj) => {
    console.log(message);
    if (errObj) {
        if (errObj.response)
            console.log(errObj.response.status);
        else
            console.log(errObj);
    }

    // Azure Function App marks only exit-code 1 as a failed run.
    process.exit(1);
};

const postIfReady = (requestsCounterMax) => {
        // the statement below means that all subscriptions are handled properly.
        if (requestsCounter >= requestsCounterMax) {
            const now = new Date();
            const date = new Date(Date.UTC(
                now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0) - 1);
            const dateString = `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
            let textMsg = `Hey there! This is your Azure costs for \`${dateString}\`\n`;

            Object.keys(resultData).forEach(sub => {
                const selector = sub.split('-').join('');
                const linkUrl = `https://portal.azure.com/`;    // TODO : link to a corresponding subscription
                const text = `<${linkUrl}|${resultData[selector]['name']}> : \`${resultData[selector]['cost']}\``;
                textMsg = textMsg + text + '\n';
            });

            const webhookData = resolveWebhookData(textMsg);

            WebhookClient.post(webhookData.webhookUri, webhookData.payload)
                .then(resp => {
                })
                .catch(err => {
                    logApiErrorAndExit('Failed to post webhook message', err);
                });
        }
};

const handlingGuidList = () => {
    return subscriptionsArray;
};

const handleSubscription = (subscription, subscriptionsCount, accessToken) => {
    CostManagementClient.post(
        `/subscriptions/${subscription.subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2018-08-31`,
        {
            type: 'Usage',
            timeframe: 'Custom',
            timePeriod: getTimePeriod(),
            dataSet: {
                granularity: 'None',
                aggregation: {
                    totalCost: {
                        name: 'PreTaxCost',
                        function: 'Sum'
                    }
                }
            }
        },
        {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        }
    )
    .then(resp => {
        let value = [0, 'USD'];
        if (resp.data.properties.rows.length > 0) {
            value = resp.data.properties.rows[0];
        }

        const selector = subscription.subscriptionId.split('-').join('');
        if (!resultData[selector]) {
            resultData[selector] = {};
        }
        
        resultData[selector]['cost'] = Number.parseFloat(value[0]).toFixed(2) + ' ' + value[1];
        if (subscription.displayName) {
            resultData[selector]['name'] = subscription.displayName;
        }

        requestsCounter = requestsCounter + 1;
        postIfReady(2 * subscriptionsCount);
    })
    .catch(err => {
        logApiErrorAndExit('Cannot get billing data', err);
    });

    // Need to resolve display names for all provided subscriptions GUIDs
    if (handlingGuidList()) {
        CostManagementClient.get(
            `/subscriptions/${subscription.subscriptionId}?api-version=2016-06-01`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        )
        .then(resp => {
            const selector = subscription.subscriptionId.split('-').join('');
            if (!resultData[selector]) {
                resultData[selector] = {};
            }
            resultData[selector]['name'] = resp.data.displayName;

            requestsCounter = requestsCounter + 1;
            postIfReady(2 * subscriptionsCount);
        })
        .catch(err => {
            logApiErrorAndExit('Cannot get subscription name', err);
        });
    }
};

const doTheJob = () => {
    context.acquireTokenWithClientCredentials(
        resource, applicationId, clientSecret, function(err, tokenResp) {
        if (err) {
            logApiErrorAndExit('Cannot get the token', err.stack);
        } else {
            if (handlingGuidList()) {
                // The case when subscription GUIDs list is provided as the script argument
                subscriptionsArray.forEach((id) => {
                    handleSubscription({ subscriptionId: id }, subscriptionsArray.length, tokenResp.accessToken);
                });
            }
            else {
                // The case when the script needs to retrieve authorized subscriptions
                CostManagementClient.get(`/subscriptions?api-version=2019-06-01`, {
                        headers: {
                            Authorization: `Bearer ${tokenResp.accessToken}`
                        }
                    }
                )
                .then(resp => {
                    requestsCounter = requestsCounter + resp.data.value.length;

                    resp.data.value.forEach((subscription) => {
                        handleSubscription(subscription, resp.data.value.length, tokenResp.accessToken);
                    });
                })
                .catch(err => {
                    logApiErrorAndExit('Cannot get available subscriptions list', err);
                });
            }
        }
    });
};

module.exports = async function (context, myTimer) {
    doTheJob();
};
