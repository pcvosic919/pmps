#!/usr/bin/env bash
set -euo pipefail

# Creates or updates an Azure Cosmos DB for MongoDB database that shares RU/s
# across all collections. Run this before pnpm db:prepare so Mongoose-created
# collections inherit database-level shared throughput instead of each getting a
# dedicated 400 RU/s allocation.

: "${AZURE_RESOURCE_GROUP:?Set AZURE_RESOURCE_GROUP to the Cosmos DB resource group.}"
: "${COSMOS_ACCOUNT_NAME:?Set COSMOS_ACCOUNT_NAME to the Cosmos DB account name.}"
: "${COSMOS_DATABASE_NAME:?Set COSMOS_DATABASE_NAME to the MongoDB database name used by MONGODB_DB_NAME or the MONGODB_URI path.}"

COSMOS_SHARED_THROUGHPUT="${COSMOS_SHARED_THROUGHPUT:-1000}"

if ! command -v az >/dev/null 2>&1; then
    echo "Azure CLI (az) is required. Install it and run 'az login' first." >&2
    exit 127
fi

echo "Ensuring Cosmos DB Mongo database '${COSMOS_DATABASE_NAME}' uses shared throughput ${COSMOS_SHARED_THROUGHPUT} RU/s..."

if az cosmosdb mongodb database exists \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --account-name "${COSMOS_ACCOUNT_NAME}" \
    --name "${COSMOS_DATABASE_NAME}" \
    --output tsv | grep -qi '^true$'; then
    az cosmosdb mongodb database throughput update \
        --resource-group "${AZURE_RESOURCE_GROUP}" \
        --account-name "${COSMOS_ACCOUNT_NAME}" \
        --name "${COSMOS_DATABASE_NAME}" \
        --throughput "${COSMOS_SHARED_THROUGHPUT}" \
        --only-show-errors \
        --output table
else
    az cosmosdb mongodb database create \
        --resource-group "${AZURE_RESOURCE_GROUP}" \
        --account-name "${COSMOS_ACCOUNT_NAME}" \
        --name "${COSMOS_DATABASE_NAME}" \
        --throughput "${COSMOS_SHARED_THROUGHPUT}" \
        --only-show-errors \
        --output table
fi

echo "Done. Now set MONGODB_DB_NAME=${COSMOS_DATABASE_NAME} (or include /${COSMOS_DATABASE_NAME} in MONGODB_URI), then run: pnpm db:prepare"
