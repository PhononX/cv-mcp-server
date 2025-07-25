#!/bin/bash
set -e

ENVIRONMENT=$1
SERVICE_NAME=$2

# Default service names if not provided
if [ -z "$SERVICE_NAME" ]; then
    case $ENVIRONMENT in
        "dev"|"develop")
            SERVICE_NAME="cv-mcp-server-dev"
            ;;
        "prod"|"production")
            SERVICE_NAME="cv-mcp-server-prod"
            ;;
        *)
            echo "Error: Unknown environment '$ENVIRONMENT'"
            echo "Usage: $0 <environment> [service_name]"
            echo "Supported environments: dev, prod"
            echo "Example: $0 dev"
            echo "Example: $0 prod cv-mcp-server-prod"
            exit 1
            ;;
    esac
fi

if [ -z "$ENVIRONMENT" ]; then
    echo "Usage: $0 <environment> [service_name]"
    echo "Example: $0 dev"
    echo "Example: $0 prod cv-mcp-server-prod"
    exit 1
fi

echo "=== 🚀 Deploying to App Runner 🚀 ==="
echo "Environment: $ENVIRONMENT"
echo "Service Name: $SERVICE_NAME"
echo "====================================="

# Validate environment
if [ "$ENVIRONMENT" != "prod" ] && [ "$ENVIRONMENT" != "dev" ] && [ "$ENVIRONMENT" != "develop" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo "Error: Environment must be 'dev', 'develop', 'prod', or 'production'"
    exit 1
fi

# Normalize environment for config files
if [ "$ENVIRONMENT" = "develop" ]; then
    ENV_CONFIG="dev"
elif [ "$ENVIRONMENT" = "production" ]; then
    ENV_CONFIG="prod"
else
    ENV_CONFIG="$ENVIRONMENT"
fi

# Copy environment-specific apprunner.yaml
echo "Copying apprunner-${ENV_CONFIG}.yaml to apprunner.yaml..."
if [ ! -f "apprunner-${ENV_CONFIG}.yaml" ]; then
    echo "Error: apprunner-${ENV_CONFIG}.yaml not found"
    echo "Looking for config files in current directory:"
    ls -la apprunner*.yaml 2>/dev/null || echo "No apprunner config files found"
    exit 1
fi

cp "apprunner-${ENV_CONFIG}.yaml" apprunner.yaml

# Verify AWS CLI is available
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI not found"
    exit 1
fi

# Get service ARN
echo "Looking up service ARN for $SERVICE_NAME..."
SERVICE_ARN=$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn" --output text)

if [ -z "$SERVICE_ARN" ] || [ "$SERVICE_ARN" = "None" ]; then
    echo "Error: Service $SERVICE_NAME not found"
    echo "Available services:"
    aws apprunner list-services --query "ServiceSummaryList[].ServiceName" --output table
    exit 1
fi

echo "Service ARN: $SERVICE_ARN"

# Check current service status
SERVICE_STATUS=$(aws apprunner describe-service --service-arn "$SERVICE_ARN" --query "Service.Status" --output text)
echo "Current service status: $SERVICE_STATUS"

if [ "$SERVICE_STATUS" = "OPERATION_IN_PROGRESS" ]; then
    echo "Warning: Service has an operation in progress. Waiting..."
    sleep 30
fi

# Start deployment
echo "Starting deployment..."
OPERATION_ID=$(aws apprunner start-deployment --service-arn "$SERVICE_ARN" --query "OperationId" --output text)

if [ -z "$OPERATION_ID" ] || [ "$OPERATION_ID" = "None" ]; then
    echo "Error: Failed to start deployment"
    exit 1
fi

echo "Deployment started with Operation ID: $OPERATION_ID"

# Wait for deployment to complete by checking service status
echo "Waiting for deployment to complete..."
MAX_WAIT_TIME=1800  # 30 minutes
WAIT_TIME=0
SLEEP_INTERVAL=30

# Get the list of operations to find our deployment
echo "Getting operations list to track deployment..."
OPERATIONS=$(aws apprunner list-operations --service-arn "$SERVICE_ARN" --query "OperationSummaryList[?Id=='$OPERATION_ID']" --output json)

if [ "$OPERATIONS" = "[]" ]; then
    echo "⚠️  Operation not found in list, monitoring service status instead..."
fi

while [ $WAIT_TIME -lt $MAX_WAIT_TIME ]; do
    # Check service status instead of operation status
    CURRENT_SERVICE_STATUS=$(aws apprunner describe-service --service-arn "$SERVICE_ARN" --query "Service.Status" --output text)
    
    echo "Service status: $CURRENT_SERVICE_STATUS (waited ${WAIT_TIME}s)"
    
    case $CURRENT_SERVICE_STATUS in
        "RUNNING")
            echo "✅ Service is running! Deployment likely completed."
            
            # Double-check by getting recent operations
            RECENT_OPS=$(aws apprunner list-operations --service-arn "$SERVICE_ARN" --max-results 5 --query "OperationSummaryList[0:2].{Id:Id,Type:Type,Status:Status,StartedAt:StartedAt}" --output table)
            echo "Recent operations:"
            echo "$RECENT_OPS"
            break
            ;;
        "OPERATION_IN_PROGRESS")
            echo "⏳ Deployment still in progress..."
            ;;
        "CREATE_FAILED"|"UPDATE_FAILED"|"DELETE_FAILED")
            echo "❌ Deployment failed with status: $CURRENT_SERVICE_STATUS"
            
            # Get recent operations for debugging
            echo "Recent operations for debugging:"
            aws apprunner list-operations --service-arn "$SERVICE_ARN" --max-results 3 --output table
            
            exit 1
            ;;
        *)
            echo "⚠️  Service status: $CURRENT_SERVICE_STATUS"
            ;;
    esac
    
    sleep $SLEEP_INTERVAL
    WAIT_TIME=$((WAIT_TIME + SLEEP_INTERVAL))
done

if [ $WAIT_TIME -ge $MAX_WAIT_TIME ]; then
    echo "❌ Deployment monitoring timed out after $MAX_WAIT_TIME seconds"
    echo "Service may still be deploying. Check AWS Console for current status."
    exit 1
fi

# Get service information
echo "=== Deployment Summary ==="
SERVICE_INFO=$(aws apprunner describe-service --service-arn "$SERVICE_ARN")

SERVICE_URL=$(echo "$SERVICE_INFO" | jq -r '.Service.ServiceUrl')
SERVICE_STATUS=$(echo "$SERVICE_INFO" | jq -r '.Service.Status')
CREATED_AT=$(echo "$SERVICE_INFO" | jq -r '.Service.CreatedAt')
UPDATED_AT=$(echo "$SERVICE_INFO" | jq -r '.Service.UpdatedAt')

echo "Service Name: $SERVICE_NAME"
echo "Environment: $ENVIRONMENT"
echo "Status: $SERVICE_STATUS"
echo "Service URL: https://$SERVICE_URL"
echo "Created At: $CREATED_AT"
echo "Updated At: $UPDATED_AT"
echo "==========================="

# Test health endpoint
echo "Testing health endpoint..."
if command -v curl &> /dev/null; then
    sleep 10  # Give the service a moment to be ready
    HEALTH_URL="https://$SERVICE_URL/health"
    
    for i in {1..5}; do
        echo "Health check attempt $i/5..."
        if curl -f -s "$HEALTH_URL" > /dev/null; then
            echo "✅ Health check passed!"
            break
        else
            echo "⚠️  Health check failed, retrying in 10s..."
            sleep 10
        fi
        
        if [ $i -eq 5 ]; then
            echo "❌ Health check failed after 5 attempts"
            echo "Please verify the service manually: $HEALTH_URL"
        fi
    done
else
    echo "⚠️  curl not available, skipping health check"
    echo "Please verify manually: https://$SERVICE_URL/health"
fi

echo "🚀 Deployment completed successfully!"
echo "Service URL: https://$SERVICE_URL"