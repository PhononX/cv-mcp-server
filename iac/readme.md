# Steps to create the IAC AWS

## 1.2 Create IAM Role

```bash
aws iam create-role \
  --role-name AppRunnerCloudWatchRole \
  --assume-role-policy-document file://apprunner-trust-policy.json
```

## 1.3 Attach CloudWatch Logs Policy

```bash
aws iam attach-role-policy \
  --role-name AppRunnerCloudWatchRole \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess
```

## 2.1: Set Your Variables

### 2.1.3 Get connection (Github connection ARN)

```bash
aws apprunner list-connections
```

```bash
export SERVICE_NAME="cv-mcp-server-dev"
export GITHUB_REPO="https://github.com/phononx/cv-mcp-server"
export GITHUB_BRANCH="develop"
export GITHUB_CONNECTION_ARN="arn:aws:apprunner:us-east-2:336746746018:connection/GithubPhononX/5346579f49054a59a6e309da4d0e9634"
export ROLE_ARN="arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/AppRunnerCloudWatchRole"
```

## 2.2 Create App Runner Service

```bash
aws apprunner create-service \
  --service-name $SERVICE_NAME \
  --source-configuration '{
    "AuthenticationConfiguration": {
      "ConnectionArn": "'"$GITHUB_CONNECTION_ARN"'"
    },
    "AutoDeploymentsEnabled": false,
    "CodeRepository": {
      "RepositoryUrl": "'"$GITHUB_REPO"'",
      "SourceCodeVersion": {
        "Type": "BRANCH",
        "Value": "'"$GITHUB_BRANCH"'"
      },
      "CodeConfiguration": {
        "ConfigurationSource": "REPOSITORY"
      }
    }
  }' \
  --instance-configuration '{
    "InstanceRoleArn": "'"$ROLE_ARN"'"
  }' \
  --health-check-configuration '{
    "Protocol": "'"HTTP"'",
    "Path": "'"/health"'",
    "Interval": 10,
    "Timeout": 2,
    "HealthyThreshold": 2,
    "UnhealthyThreshold": 5
  }'

```

### How Delete App Runner instance

```bash
# First Grab the app-runner-arn
aws apprunner list-services

# Copy the arn to delete (ex: arn:aws:apprunner:us-east-2:336746746018:service/cv-mcp-server/694f13ea1db7457ba88797008302f31b)
aws apprunner delete-service --service-arn arn:aws:apprunner:us-east-2:336746746018:service/cv-mcp-server/694f13ea1db7457ba88797008302f31b

```
