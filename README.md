# Azure subscription cost reporter [![Snyk Status](https://snyk.io/test/github/denis1stomin/azure-cost-reporter/badge.svg?targetFile=package.json)](https://snyk.io/test/github/denis1stomin/azure-cost-reporter?targetFile=package.json)

Simple Azure Function app which monthly reports costs for a list of Azure subscriptions to Slack channel.

## How to deploy the app using Azure CLI on Linux

First you need to create a service principal and assign "Cost Management Reader" role to it for a number of interesting azure subscriptions which you want to get cost reports for.
* `az ad sp create-for-rbac --name azure-cost-reporter --skip-assignment`
* `APP_ID=<appId>` (get this value from the previous command output)
* `APP_SECRET=<password>` (get this value from the previous command output)
* `# az account show` (id is yours current subscription id)
* `az role assignment create --assignee $APP_ID --role "Cost Management Reader" --scope /subscriptions/<subscription id>` (assign the role for any number of interesting subscriptions)

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

Finally you need to set a few important settings for the app.
* `az functionapp config appsettings set --settings "APP_ID=$APP_ID APP_SECRET=$APP_SECRET" -n $UNIQUE_NAME-app -g $RGROUP` (service principal credential)
* `# az account show` (find tenantId value)
* `az functionapp config appsettings set --settings "TARGET_TENANT=<tenantId>" -n $UNIQUE_NAME-app -g $RGROUP` (azure tenant id)
* `# az account show` (id is yours current subscription id)
* `az functionapp config appsettings set --settings "TARGET_SUBSCRIPTIONS_JARRazure tenant idAY=[\"subscriptionId\",\"subscriptionId2\"]" -n $UNIQUE_NAME-app -g $RGROUP` (list of interesting subscription IDs)
* `az functionapp config appsettings set --settings "SLACK_CHANNEL=<slack channel>" -n $UNIQUE_NAME-app -g $RGROUP` (slack channel id or name)
* `az functionapp config appsettings set --settings "SLACK_WEBHOOK=<webhook>" -n $UNIQUE_NAME-app -g $RGROUP` (slack webhook URI)
