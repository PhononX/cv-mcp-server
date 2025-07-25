#!/bin/bash
set -e

ENVIRONMENT=$1
SERVICE_NAME=$2
LOG_LEVEL="info"

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

# Normalize environment
if [ "$ENVIRONMENT" = "develop" ]; then
    ENV_CONFIG="dev"
elif [ "$ENVIRONMENT" = "production" ]; then
    ENV_CONFIG="prod"
else
    ENV_CONFIG="$ENVIRONMENT"
fi

# Set environment-specific variables
if [ "$ENV_CONFIG" = "prod" ]; then
    ENV_VALUE="prod"
    # Only set LOG_LEVEL if not already defined
    if [ -z "$LOG_LEVEL" ]; then
        LOG_LEVEL="info"
    fi
else
    ENV_VALUE="dev"
    # Only set LOG_LEVEL if not already defined
    if [ -z "$LOG_LEVEL" ]; then
        LOG_LEVEL="debug"
    fi
fi

# Default service names if not provided
if [ -z "$SERVICE_NAME" ]; then
    case $ENV_CONFIG in
        "dev")
            SERVICE_NAME="cv-mcp-server-dev"
            ;;
        "prod")
            SERVICE_NAME="cv-mcp-server-prod"
            ;;
    esac
fi

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

# Optional: Update environment variables if they've changed
# This is useful if you want to update env vars during deployment
echo "🔄 Updating environment variables for $ENV_VALUE environment..."
aws apprunner update-service \
    --service-arn "$SERVICE_ARN" \
    --source-configuration '{
        "AuthenticationConfiguration": {
            "ConnectionArn": "arn:aws:apprunner:us-east-2:336746746018:connection/GithubPhononX/5346579f49054a59a6e309da4d0e9634"
        },
        "AutoDeploymentsEnabled": false,
        "CodeRepository": {
            "RepositoryUrl": "https://github.com/phononx/cv-mcp-server",
            "SourceCodeVersion": {
                "Type": "BRANCH",
                "Value": "develop"
            },            
            "CodeConfiguration": {
                "ConfigurationSource": "API",
                "CodeConfigurationValues": {
                    "Runtime": "NODEJS_22",
                    "BuildCommand": "npm ci && npm run build",
                    "StartCommand": "npm run start:http",
                    "Port": "3000",
                    "RuntimeEnvironmentVariables": {
                        "ENVIRONMENT": "'"$ENV_VALUE"'",
                        "LOG_LEVEL": "'"$LOG_LEVEL"'",
                        "LOG_TRANSPORT": "cloudwatch",
                        "CARBON_VOICE_BASE_URL": "https://api.carbonvoice.app"
                    }
                }
            }
        }
    }' > /dev/null

echo "Environment variables updated successfully."

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

while [ $WAIT_TIME -lt $MAX_WAIT_TIME ]; do
    # Check service status
    CURRENT_SERVICE_STATUS=$(aws apprunner describe-service --service-arn "$SERVICE_ARN" --query "Service.Status" --output text)
    
    echo "Service status: $CURRENT_SERVICE_STATUS (waited ${WAIT_TIME}s)"
    
    case $CURRENT_SERVICE_STATUS in
        "RUNNING")
            echo "✅ Service is running! Checking if deployment succeeded or rolled back..."
            
            # Check if our specific operation succeeded or failed
            OPERATION_STATUS=$(aws apprunner list-operations --service-arn "$SERVICE_ARN" --max-results 10 --query "OperationSummaryList[?Id=='$OPERATION_ID'].Status" --output text)
            
            if [ -z "$OPERATION_STATUS" ]; then
                echo "⚠️  Could not find operation status, checking recent operations..."
                RECENT_OPS=$(aws apprunner list-operations --service-arn "$SERVICE_ARN" --max-results 3 --query "OperationSummaryList[0:3].{Id:Id,Type:Type,Status:Status,StartedAt:StartedAt}" --output table)
                echo "Recent operations:"
                echo "$RECENT_OPS"
                
                # Check if the most recent operation is our deployment and if it succeeded
                MOST_RECENT_OP=$(aws apprunner list-operations --service-arn "$SERVICE_ARN" --max-results 1 --query "OperationSummaryList[0].{Id:Id,Status:Status}" --output json)
                MOST_RECENT_ID=$(echo "$MOST_RECENT_OP" | jq -r '.Id')
                MOST_RECENT_STATUS=$(echo "$MOST_RECENT_OP" | jq -r '.Status')
                
                if [ "$MOST_RECENT_ID" = "$OPERATION_ID" ]; then
                    if [ "$MOST_RECENT_STATUS" = "SUCCEEDED" ]; then
                        echo "✅ Deployment succeeded!"
                        break
                    elif [[ "$MOST_RECENT_STATUS" == *"ROLLBACK"* ]]; then
                        echo "❌ Deployment failed and rolled back! Status: $MOST_RECENT_STATUS"
                        echo "Getting recent operations for debugging:"
                        aws apprunner list-operations --service-arn "$SERVICE_ARN" --max-results 5 --output table
                        exit 1
                    else
                        echo "❌ Deployment failed with status: $MOST_RECENT_STATUS"
                        exit 1
                    fi
                else
                    echo "⚠️  Most recent operation ID doesn't match our deployment. Assuming success since service is running."
                    break
                fi
            else
                echo "Operation status: $OPERATION_STATUS"
                if [ "$OPERATION_STATUS" = "SUCCEEDED" ]; then
                    echo "✅ Deployment succeeded!"
                    break
                elif [[ "$OPERATION_STATUS" == *"ROLLBACK"* ]]; then
                    echo "❌ Deployment failed and rolled back! Status: $OPERATION_STATUS"
                    echo "Getting recent operations for debugging:"
                    aws apprunner list-operations --service-arn "$SERVICE_ARN" --max-results 5 --output table
                    exit 1
                else
                    echo "❌ Deployment failed with status: $OPERATION_STATUS"
                    exit 1
                fi
            fi
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