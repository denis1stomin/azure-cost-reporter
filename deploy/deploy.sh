az group create --name "azure-cost-reporter" --location "eastus"
az group deployment create --name "azure-cost-reporter" --resource-group "azure-cost-reporter" --template-file "template.json" --parameters "./parameters.json"
