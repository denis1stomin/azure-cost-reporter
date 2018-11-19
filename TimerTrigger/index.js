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
const WEBHOOK_TOKEN = getParameter('SLACK_TOKEN');
const WEBHOOK_CHANNEL = getParameter('SLACK_CHANNEL');

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
    baseURL: 'https://slack.com/api/chat.postMessage',
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
    date.setMilliseconds(999);
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

const postIfReady = () => {
        // it means that all subscriptions are handled properly.
        if (requestsCounter == 2 * subscriptionsArray.length) {
            const date = new Date();
            let month = date.getUTCMonth() - 1;
            if (month == 0) {
                month = 12;
            }
            const dateString = `${MONTH_NAMES[month]} ${date.getUTCFullYear()}`;
            let slackMsg = `Hey @here and there! This is your Azure cost report for \`${dateString}\`\n`;

            subscriptionsArray.forEach(sub => {
                const selector = sub.split('-').join('');
                const text = `${resultData[selector]['name']} : \`${resultData[selector]['cost']}\``;
                slackMsg = slackMsg + text + '\n';
            });

            SlackClient.post('/', {
                    text: slackMsg,
                    username: 'Azure cost reporter',
                    icon_emoji: ':male-mage:',
                    channel: WEBHOOK_CHANNEL,
                    token: WEBHOOK_TOKEN
                })
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


module.exports = async function (context, myTimer) {
    doTheJob();
};
