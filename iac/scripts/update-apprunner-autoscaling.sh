#!/bin/bash
# =============================================================================
# update-apprunner-autoscaling.sh
#
# Creates a new App Runner auto-scaling configuration and applies it to the
# service.  The current config pins the service to 1 instance and allows up
# to 200 concurrent requests per instance — so App Runner never scales out
# regardless of load.  This replaces it with sensible production defaults.
#
# New defaults:
#   MinSize        = 1   (always 1 warm instance, no cold-start on first user)
#   MaxSize        = 5   (allow up to 5 instances under heavy load)
#   MaxConcurrency = 10  (trigger a new instance when a single instance hits
#                         10 concurrent in-flight requests; keeps per-instance
#                         load low so tool calls stay fast and well inside the
#                         120 s timeout window)
#
# Usage:
#   ./iac/scripts/update-apprunner-autoscaling.sh [prod|dev]
#
# Requirements: aws CLI, jq
# =============================================================================
set -euo pipefail

ENVIRONMENT="${1:-prod}"
AWS_REGION="${AWS_REGION:-us-east-2}"

# ── Tunable defaults (override via env vars if needed) ──────────────────────
# Lower MaxConcurrency = App Runner spins up new instances sooner.
# Rule of thumb: set it to the number of concurrent tool calls you're
# comfortable running on one 1-vCPU Node.js process simultaneously.
AS_MIN_SIZE="${AS_MIN_SIZE:-1}"
AS_MAX_SIZE="${AS_MAX_SIZE:-5}"
AS_MAX_CONCURRENCY="${AS_MAX_CONCURRENCY:-10}"
AS_CONFIG_NAME="mcp-prod-scaling"

case "$ENVIRONMENT" in
  prod|production) SERVICE_NAME="cv-mcp-server-prod" ;;
  dev|develop)     SERVICE_NAME="cv-mcp-server-dev"
                   AS_CONFIG_NAME="mcp-dev-scaling"
                   AS_MAX_SIZE="${AS_MAX_SIZE:-2}" ;;
  *)
    echo "Usage: $0 [prod|dev]"
    exit 1
    ;;
esac

echo "=== App Runner Auto-Scaling Update ==="
echo "Service          : $SERVICE_NAME"
echo "Region           : $AWS_REGION"
echo "New MinSize      : $AS_MIN_SIZE"
echo "New MaxSize      : $AS_MAX_SIZE"
echo "New MaxConcurrency: $AS_MAX_CONCURRENCY"
echo "======================================="
echo
echo "Current config (before change):"
echo "  MaxConcurrency=200, MaxSize=1, MinSize=1"
echo "  → All users share one instance. App Runner never scales out."
echo
echo "New config:"
echo "  MaxConcurrency=$AS_MAX_CONCURRENCY, MaxSize=$AS_MAX_SIZE, MinSize=$AS_MIN_SIZE"
echo "  → A new instance starts when any instance hits $AS_MAX_CONCURRENCY concurrent"
echo "    requests, up to $AS_MAX_SIZE instances total."
echo

read -r -p "Continue? [y/N] " CONFIRM
if [[ "${CONFIRM,,}" != "y" ]]; then
  echo "Aborted."
  exit 0
fi

# ── 1. Look up service ARN ───────────────────────────────────────────────────
echo
echo "Looking up service ARN for $SERVICE_NAME..."
SERVICE_ARN=$(aws apprunner list-services \
  --region "$AWS_REGION" \
  --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn" \
  --output text)

if [ -z "$SERVICE_ARN" ] || [ "$SERVICE_ARN" = "None" ]; then
  echo "❌  Service '$SERVICE_NAME' not found."
  exit 1
fi
echo "Service ARN: $SERVICE_ARN"

# ── 2. Create new auto-scaling configuration ─────────────────────────────────
echo
echo "Creating auto-scaling configuration '$AS_CONFIG_NAME'..."
AS_ARN=$(aws apprunner create-auto-scaling-configuration \
  --region "$AWS_REGION" \
  --auto-scaling-configuration-name "$AS_CONFIG_NAME" \
  --min-size "$AS_MIN_SIZE" \
  --max-size "$AS_MAX_SIZE" \
  --max-concurrency "$AS_MAX_CONCURRENCY" \
  --query 'AutoScalingConfiguration.AutoScalingConfigurationArn' \
  --output text)

echo "✅ New auto-scaling config ARN: $AS_ARN"

# ── 3. Apply to service ───────────────────────────────────────────────────────
echo
echo "Applying auto-scaling configuration to $SERVICE_NAME..."
aws apprunner update-service \
  --region "$AWS_REGION" \
  --service-arn "$SERVICE_ARN" \
  --auto-scaling-configuration-arn "$AS_ARN" \
  > /dev/null

echo "✅ Service update initiated."
echo
echo "⏳ Waiting for service to return to RUNNING state..."

MAX_WAIT=900
WAITED=0
INTERVAL=15

while [ $WAITED -lt $MAX_WAIT ]; do
  STATUS=$(aws apprunner describe-service \
    --region "$AWS_REGION" \
    --service-arn "$SERVICE_ARN" \
    --query "Service.Status" --output text)
  echo "  Status: $STATUS  (${WAITED}s elapsed)"

  if [ "$STATUS" = "RUNNING" ]; then
    echo
    echo "✅ Service is RUNNING with new auto-scaling configuration."
    break
  fi

  if [[ "$STATUS" == *"FAILED"* ]]; then
    echo "❌ Service update failed: $STATUS"
    exit 1
  fi

  sleep $INTERVAL
  WAITED=$((WAITED + INTERVAL))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "❌ Timed out waiting for RUNNING state. Check the AWS console."
  exit 1
fi

# ── 4. Verify ─────────────────────────────────────────────────────────────────
echo
echo "=== Verification ==="
aws apprunner describe-auto-scaling-configuration \
  --region "$AWS_REGION" \
  --auto-scaling-configuration-arn "$AS_ARN" \
  --query 'AutoScalingConfiguration.{Name:AutoScalingConfigurationName,Min:MinSize,Max:MaxSize,Concurrency:MaxConcurrency,Status:Status}' \
  --output table

echo
echo "=== What happens next ==="
echo "  • Under light load   : 1 instance handles all requests."
echo "  • When any instance reaches $AS_MAX_CONCURRENCY concurrent requests,"
echo "    App Runner starts a second instance automatically."
echo "  • Up to $AS_MAX_SIZE instances can run simultaneously."
echo "  • Each instance handles at most ~$AS_MAX_CONCURRENCY concurrent"
echo "    in-flight requests, keeping tool calls fast and well inside the"
echo "    120-second timeout window."
echo
echo "🚀 Done.  Monitor the service in CloudWatch to tune MaxConcurrency"
echo "   (lower = scale sooner, higher = pack more onto each instance)."
