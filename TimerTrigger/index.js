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
const subscriptionsArray = JSON.parse(getParameter('TARGET_SUBSCRIPTIONS_JARRAY'));
const authorityUrl = authorityHostUrl + '/' + tenant;
const applicationId = getParameter('APP_ID');
const clientSecret = getParameter('APP_SECRET');
const resource = 'https://management.azure.com';
const WEBHOOK_PATH = getParameter('SLACK_WEBHOOK');
const WEBHOOK_CHANNEL = process.env['SLACK_CHANNEL'];

let requestsCounter = 0;
let resultData = {};

const CostManagementClient = Axios.create({
    baseURL: 'https://management.azure.com',
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
});
const SlackClient = Axios.create({
    baseURL: 'https://hooks.slack.com/services',
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

const getBotNameAndIcon = () => {
    const nowDate = new Date();
    const month = nowDate.getUTCMonth() + 1;
    const day = nowDate.getUTCDay();

    // New Year
    if ((month == 12 && day >= 25) || (month == 1 && day <= 3)) {
        return {
            username: 'Azure Santa',
            icon_emoji: ':santa:'
        };
    }

    // Chinese New Year
    if ((month == 1 && day >= 20) || (month == 2 && day <= 20)) {
        return {
            username: 'Azure Dragon',
            icon_emoji: ':dragon:'
        };
    }

    // Default mage
    return {
        username: 'Azure Mage',
        icon_emoji: ':male_mage:'
    };
};

const postIfReady = () => {
        // the statement below means that all subscriptions are handled properly.
        if (requestsCounter == 2 * subscriptionsArray.length) {
            const now = new Date();
            const date = new Date(Date.UTC(
                now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0) - 1);
            const dateString = `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
            let slackMsg = `Hey @here and there! This is your Azure costs for \`${dateString}\`\n`;

            subscriptionsArray.forEach(sub => {
                const selector = sub.split('-').join('');
                const text = `${resultData[selector]['name']} : \`${resultData[selector]['cost']}\``;
                slackMsg = slackMsg + text + '\n';
            });

            // prepare slack message and send it
            const botIconAndName = getBotNameAndIcon();
            console.log(botIconAndName);
            let slackPayload = {
                text: slackMsg,
                parse: 'full',
                ...botIconAndName
            };
            if (WEBHOOK_CHANNEL) {
                slackPayload.channel = WEBHOOK_CHANNEL;
            }

            SlackClient.post(WEBHOOK_PATH, slackPayload)
                .then(resp => {
                })
                .catch(err => {
                    console.log('post slack', err.response.status);
                });
        }
};

const handleSubscription = (subscription, accessToken) => {
    CostManagementClient.post(
        `/subscriptions/${subscription}/providers/Microsoft.CostManagement/query?api-version=2018-08-31`,
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

        const selector = subscription.split('-').join('');
        if (!resultData[selector]) {
            resultData[selector] = {};
        }
        resultData[selector]['cost'] = Number.parseFloat(value[0]).toFixed(2) + ' ' + value[1];
        requestsCounter = requestsCounter + 1;
        postIfReady();
    })
    .catch(err => {
        console.log("Hm, I can't get billing data", err);
        console.log("Hm, I can't get billing data", err.response.status);
    });

    CostManagementClient.get(
        `/subscriptions/${subscription}?api-version=2016-06-01`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        }
    )
    .then(resp => {
        const selector = subscription.split('-').join('');
        if (!resultData[selector]) {
            resultData[selector] = {};
        }
        resultData[selector]['name'] = resp.data.displayName;
        requestsCounter = requestsCounter + 1;
        postIfReady();
    })
    .catch(err => {
        console.log("Oh, I can't get subscription name", err);
        console.log("Oh, I can't get subscription name", err.response.status);
    });
};

const doTheJob = () => {
    context.acquireTokenWithClientCredentials(
        resource, applicationId, clientSecret, function(err, tokenResp) {
        if (err) {
            console.log("Well, I can't get the token: " + err.stack);
        } else {
            subscriptionsArray.forEach((subscription) => {
                handleSubscription(subscription, tokenResp.accessToken);
            });
        }
    });
};

doTheJob();


//module.exports = async function (context, myTimer) {
//    doTheJob();
//};
