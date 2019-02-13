# Azure subscription cost reporter [![Snyk Status](https://snyk.io/test/github/denis1stomin/azure-cost-reporter/badge.svg?targetFile=package.json)](https://snyk.io/test/github/denis1stomin/azure-cost-reporter?targetFile=package.json)

Simple open source Azure Function app which monthly reports costs for a list of Azure subscriptions to a Slack channel. The application uses Azure Subscription Cost API to retrieve Azure subscription consumption data. It is a good sample application which can be easily customized according to your needs :)


## How to deploy the app using Azure CLI on Linux or Portal

First you need to create a service principal and assign "Cost Management Reader" role to it for a number of interesting azure subscriptions which you want to get cost reports for. Default azure-cli subscription is used in the example below. But you can set any subscription you want to monitor.
* `az ad sp create-for-rbac --name azure-cost-reporter --skip-assignment`
* `APP_ID=<appId>` (get this value from the previous command output)
* `APP_SECRET=<password>` (get this value from the previous command output)
* `# az account show | grep "id"` (find id of your current default subscription)
* `SUBSCRIPTION_ID=<subscription id>` (interesting subscription to monitor)
* `az role assignment create --assignee $APP_ID --role "Cost Management Reader" --scope /subscriptions/$SUBSCRIPTION_ID` (assign the role for any number of interesting subscriptions)
* Go to `Azure Portal -> Subscriptions -> <subscription> -> Access control (IAM) -> Role Assignments` and ensure `azure-cost-reporter` has the `Cost Management Reader` role.

Now you need to deploy a function app instance and deploy the source code from this GitHub repository.
* `RGROUP=azure-cost-reporter` (resource group name)
* `az group create --name $RGROUP --location eastus` (create resource group)
* `UNIQUE_NAME=acr$RANDOM` (create unique name)
* `az storage account create --name $UNIQUE_NAME --resource-group $RGROUP --sku Standard_LRS --kind StorageV2` (create storage account)
* `# az provider register --namespace Microsoft.Insights` (register appropriate provider if needed)
* `az resource create --resource-group $RGROUP --resource-type "Microsoft.Insights/components" --name $UNIQUE_NAME-insights --properties "{\"Application_Type\":\"web\"}"` (create application insights instance)
* `INSTR_KEY=<key here>` (InstrumentationKey value from previous command output)
* `GITREPO=https://github.com/denis1stomin/azure-cost-reporter.git`
* `az functionapp create --resource-group $RGROUP --name $UNIQUE_NAME-app --storage-account $UNIQUE_NAME --runtime node --app-insights $UNIQUE_NAME-insights --app-insights-key $INSTR_KEY -c eastus -u "$GITREPO"` (create function app)
* `# az functionapp deployment source sync --resource-group $RGROUP --name $UNIQUE_NAME-app` (manually synchronize function source code if this git repo is updated)

Finally you need to set a few important settings for the app.
* `az functionapp config appsettings set --settings "APP_ID=$APP_ID" "APP_SECRET=$APP_SECRET" -n $UNIQUE_NAME-app -g $RGROUP` (service principal credential)
* `az account show | grep "tenantId"` (find tenant id)
* `az functionapp config appsettings set --settings "TARGET_TENANT=<tenantId>" -n $UNIQUE_NAME-app -g $RGROUP` (azure tenant id)
* `az functionapp config appsettings set --settings "TARGET_SUBSCRIPTIONS_JARRAY=[\"$SUBSCRIPTION_ID\"]" -n $UNIQUE_NAME-app -g $RGROUP` (list of interesting subscription IDs to monitor)
* `az functionapp config appsettings set --settings "SLACK_WEBHOOK=<webhook>" -n $UNIQUE_NAME-app -g $RGROUP` (slack webhook URI)
* `az functionapp config appsettings set --settings "SLACK_CHANNEL=<slack channel>" -n $UNIQUE_NAME-app -g $RGROUP` (slack channel id or #public-name to use instead of the webhook default channel)

Enjoy the app! :)
