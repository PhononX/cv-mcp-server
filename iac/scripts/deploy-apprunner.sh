#!/bin/bash
set -e

ENVIRONMENT=$1
SERVICE_NAME=$2

if [ -z "$ENVIRONMENT" ] || [ -z "$SERVICE_NAME" ]; then
    echo "Usage: $0 <environment> <service_name>"
    echo "Example: $0 prod cv-mcp-server-prod"
    exit 1
fi

echo "Deploying to App Runner service: $SERVICE_NAME (Environment: $ENVIRONMENT)"

# Copy environment-specific apprunner.yaml
cp "apprunner-${ENVIRONMENT}.yaml" apprunner.yaml

# Get service ARN
SERVICE_ARN=$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn" --output text)

if [ -z "$SERVICE_ARN" ]; then
    echo "Error: Service $SERVICE_NAME not found"
    exit 1
fi

echo "Service ARN: $SERVICE_ARN"

# Start deployment
OPERATION_ID=$(aws apprunner start-deployment --service-arn "$SERVICE_ARN" --query "OperationId" --output text)

echo "Deployment started with Operation ID: $OPERATION_ID"

# Wait for deployment to complete
echo "Waiting for deployment to complete..."
while true; do
    STATUS=$(aws apprunner describe-operation \
        --service-arn "$SERVICE_ARN" \
        --operation-id "$OPERATION_ID" \
        --query "Operation.Status" \
        --output text)
    
    echo "Deployment status: $STATUS"
    
    if [ "$STATUS" = "SUCCEEDED" ]; then
        echo "Deployment completed successfully!"
        break
    elif [ "$STATUS" = "FAILED" ]; then
        echo "Deployment failed!"
        exit 1
    fi
    
    sleep 30
done

# Get service URL
SERVICE_URL=$(aws apprunner describe-service --service-arn "$SERVICE_ARN" --query "Service.ServiceUrl" --output text)
echo "Service URL: https://$SERVICE_URL"